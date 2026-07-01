import type {
  InferenceBackend,
  GenerateRequest,
} from "../interfaces/inference.ts";
import type { FetchLike } from "./ollama-inference.ts";

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
      const res = await doFetch(`${host}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model ?? "local",
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
      if (!res.ok) throw new Error(`llama.cpp HTTP ${res.status} ${res.statusText}`.trim());
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
