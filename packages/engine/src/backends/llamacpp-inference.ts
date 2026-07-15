import type {
  InferenceBackend,
  GenerateRequest,
} from "../interfaces/inference.ts";
import type { ChatMessage } from "../types.ts";
import type { FetchLike } from "./ollama-inference.ts";

/**
 * Drop the OLDEST non-system turns, one user/assistant PAIR at a time (never
 * splitting a pair — that would break strict alternation), until the estimated
 * size is under budget. Always keeps the system message (if any) and at least
 * the final user turn, so there's always something valid left to send.
 */
function dropOldestPair(messages: readonly ChatMessage[]): ChatMessage[] {
  const hasSystem = messages[0]?.role === "system";
  const head = hasSystem ? messages.slice(0, 1) : [];
  const rest = hasSystem ? messages.slice(1) : messages.slice(0);
  if (rest.length <= 1) return [...messages]; // nothing left to drop but the final turn
  return [...head, ...rest.slice(2)];
}

/**
 * The llama.cpp backend: talks to a local `llama-server` over its
 * OpenAI-compatible streaming API — fully offline, no API key, loopback only.
 * This is the runtime that pairs with GGUF weights fetched by ggufInstaller, so
 * `/setup` can be entirely Ollama-free. A running llama-server is needs-user; the
 * adapter is testable with an injected fetch.
 */
export interface LlamaCppOptions {
  /** llama-server base URL. */
  readonly host?: string;
  /** Optional model label (llama-server serves whatever GGUF it was started with). */
  readonly model?: string;
  readonly fetch?: FetchLike;
}

const DEFAULT_HOST = "http://127.0.0.1:8080";

export function llamaCppInference(opts: LlamaCppOptions = {}): InferenceBackend {
  const host = opts.host ?? DEFAULT_HOST;
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));

  return {
    name: "llama.cpp",

    async isAvailable() {
      try {
        const res = await doFetch(`${host}/health`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async *generate(req: GenerateRequest): AsyncIterable<string> {
      // Large models are tuned with SMALLER context windows (less RAM headroom
      // left after their bigger weights), so a long-running conversation can
      // outgrow the window well before it would with a small model — llama.cpp
      // then refuses the whole request with HTTP 400 "exceeds the available
      // context size". Rather than surface that raw, retry with the oldest
      // turns dropped (one user/assistant pair at a time) until it fits or
      // there's truly nothing left to trim — so a long conversation degrades
      // gracefully (forgets its oldest turns) instead of hard-failing.
      let messages: readonly ChatMessage[] = req.messages;
      const MAX_TRIM_ATTEMPTS = 6;
      let res: Awaited<ReturnType<FetchLike>> | undefined;
      let lastErrorBody = "";
      for (let attempt = 0; attempt <= MAX_TRIM_ATTEMPTS; attempt++) {
        // Attach images (data URIs) to the LAST user message as OpenAI-style
        // multimodal content; text-only messages stay plain strings.
        const images = req.images ?? [];
        const lastUser = images.length ? messages.map((m) => m.role).lastIndexOf("user") : -1;
        const body = messages.map((m, i) => {
          if (i === lastUser) {
            return {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                ...images.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

        res = await doFetch(`${host}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: opts.model ?? "local",
            messages: body,
            stream: true,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          }),
        });
        if (res.ok) break;

        lastErrorBody = await res.text().catch(() => "");
        let isContextOverflow = false;
        try {
          const parsed = JSON.parse(lastErrorBody) as { error?: { type?: string; message?: string } };
          isContextOverflow =
            parsed.error?.type === "exceed_context_size_error" ||
            /exceeds the available context size/i.test(parsed.error?.message ?? "");
        } catch {
          // non-JSON body — not a context-overflow response we can act on
        }
        if (!isContextOverflow || attempt === MAX_TRIM_ATTEMPTS) break;

        const trimmed = dropOldestPair(messages);
        if (trimmed.length === messages.length) break; // nothing left to drop
        messages = trimmed;
      }

      if (!res || !res.ok) {
        const detail = lastErrorBody ? ` — ${lastErrorBody.slice(0, 300)}` : "";
        throw new Error(`llama.cpp HTTP ${res?.status ?? "?"} ${res?.statusText ?? ""}${detail}`.trim());
      }
      if (!res.body) throw new Error("llama.cpp response had no body to stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") return;
          try {
            const j = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const c = j.choices?.[0]?.delta?.content;
            if (c) yield c;
          } catch {
            // ignore keep-alives / partial frames
          }
        }
      }
    },
  };
}
