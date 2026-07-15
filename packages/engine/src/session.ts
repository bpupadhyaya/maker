import type { InferenceBackend } from "./interfaces/inference.ts";
import type { MakerEvent } from "./events.ts";
import type { ChatMessage } from "./types.ts";

/**
 * Many instruct-tuned chat templates (Llama 3.x, Qwen2.5, …) STRICTLY require
 * user/assistant roles to alternate and reject the request outright otherwise —
 * llama-server surfaces that as an HTTP 400 ("prompt not well formed"). History
 * can end up with two consecutive same-role turns if a prior turn errored (the
 * dangling user push) or — before the busy-guard below — if two turns were sent
 * concurrently. This merges any consecutive same-role messages (joining content
 * with a blank line) right before we build the request, so a template is NEVER
 * handed a non-alternating conversation — including one already corrupted and
 * persisted to disk before this fix shipped.
 */
export function normalizeAlternation(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role && m.role !== "system") {
      out[out.length - 1] = { ...prev, content: `${prev.content}\n\n${m.content}` };
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Everything a Session needs, injected behind interfaces. */
export interface SessionDeps {
  readonly inference: InferenceBackend;
  /** Optional system prompt seeded into the conversation. */
  readonly systemPrompt?: string;
  /** Effort → generation params (temperature/maxTokens), read fresh each turn (H9.4). */
  readonly genParams?: () =>
    | { temperature?: number; maxTokens?: number }
    | Promise<{ temperature?: number; maxTokens?: number }>;
}

/** Per-turn options (e.g. images for vision models). */
export interface TurnOptions {
  readonly images?: readonly string[];
}

export interface Session {
  /** Process one user turn, streaming events as they happen. */
  send(userMessage: string, opts?: TurnOptions): AsyncIterable<MakerEvent>;
  /** Restore prior non-system turns (auto-resume, H9.5). Replaces existing non-system history. */
  load(messages: readonly ChatMessage[]): void;
  /** The conversation so far (for inspection and tests). */
  readonly history: readonly ChatMessage[];
}

/**
 * The headless engine's core surface. Front-ends (TUI in M0.3, GUI in M0.8) are
 * thin clients over this — they send a message and render the streamed events.
 *
 * M0.1 wires only the InferenceBackend. ToolRuntime, BriefStore and MemoryStore
 * join in later milestones, always behind their interfaces so this stays the
 * single, UI-agnostic entry point.
 */
export function createSession(deps: SessionDeps): Session {
  const history: ChatMessage[] = [];
  if (deps.systemPrompt !== undefined) {
    history.push({ role: "system", content: deps.systemPrompt });
  }
  // Reentrancy guard: a slow model (e.g. a 70B model) can take a long time to
  // reply, and an impatient user (or an automated caller like self-heal) can
  // submit a second turn before the first finishes. Two "user" pushes with no
  // assistant reply between them breaks strict-alternation templates. Reject a
  // concurrent turn instead of corrupting history.
  let busy = false;

  async function* send(userMessage: string, opts?: TurnOptions): AsyncIterable<MakerEvent> {
    if (busy) {
      yield { type: "error", message: "Still working on your last message — wait for it to finish before sending another." };
      return;
    }
    busy = true;
    const userIndex = history.length;
    history.push({ role: "user", content: userMessage });
    let assembled = "";
    const images = opts?.images;
    const params = deps.genParams ? await deps.genParams() : {};
    try {
      for await (const chunk of deps.inference.generate({
        messages: normalizeAlternation(history),
        ...(images && images.length ? { images } : {}),
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
      })) {
        assembled += chunk;
        yield { type: "assistant-delta", text: chunk };
      }
      history.push({ role: "assistant", content: assembled });
      yield { type: "assistant-done", text: assembled };
    } catch (err) {
      // Revert the dangling user push — an errored turn didn't happen, so the
      // NEXT attempt starts from clean, still-alternating history instead of
      // stacking another user message on top of this one.
      if (history.length > userIndex && history[userIndex]?.role === "user") history.length = userIndex;
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      busy = false;
    }
  }

  return {
    send,
    load(messages: readonly ChatMessage[]): void {
      // Keep the seeded system prompt; replace the rest with the restored turns.
      const system = history[0]?.role === "system" ? [history[0]] : [];
      history.length = 0;
      history.push(...system, ...messages.filter((m) => m.role !== "system"));
    },
    get history() {
      return history;
    },
  };
}
