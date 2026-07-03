import type { InferenceBackend } from "./interfaces/inference.ts";
import type { MakerEvent } from "./events.ts";
import type { ChatMessage } from "./types.ts";

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

  async function* send(userMessage: string, opts?: TurnOptions): AsyncIterable<MakerEvent> {
    history.push({ role: "user", content: userMessage });
    let assembled = "";
    const images = opts?.images;
    const params = deps.genParams ? await deps.genParams() : {};
    try {
      for await (const chunk of deps.inference.generate({
        messages: history,
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
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    send,
    get history() {
      return history;
    },
  };
}
