import type {
  InferenceBackend,
  GenerateRequest,
} from "../interfaces/inference.ts";

/** A `fetch`-compatible function. Injectable so tests need no real server. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface OllamaOptions {
  /** Model tag, e.g. "qwen2.5-coder:7b". */
  readonly model?: string;
  /** Ollama host. Defaults to the local daemon. */
  readonly host?: string;
  /** Injectable fetch (defaults to global fetch); lets tests mock the HTTP layer. */
  readonly fetch?: FetchLike;
}

interface OllamaChatLine {
  readonly message?: { readonly role?: string; readonly content?: string };
  readonly done?: boolean;
}

const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5-coder:7b";

/**
 * A real, local InferenceBackend backed by Ollama (M0.2).
 *
 * Talks to Ollama's HTTP API on localhost — fully offline once a model is
 * pulled. It satisfies the exact same InferenceBackend interface as the echo
 * stub, so swapping it in changes nothing upstream (that is the whole point of
 * the seam). The `fetch` dependency is injectable so the acceptance tests can
 * mock the streaming HTTP response and stay green without a running daemon.
 */
export function ollamaInference(opts: OllamaOptions = {}): InferenceBackend {
  const host = opts.host ?? DEFAULT_HOST;
  const model = opts.model ?? DEFAULT_MODEL;
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));

  return {
    name: "ollama",

    async isAvailable() {
      try {
        const res = await doFetch(`${host}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async *generate(req: GenerateRequest): AsyncIterable<string> {
      const options: Record<string, unknown> = {};
      if (req.temperature !== undefined) options["temperature"] = req.temperature;
      if (req.maxTokens !== undefined) options["num_predict"] = req.maxTokens;
      if (req.stop !== undefined) options["stop"] = req.stop;

      const res = await doFetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          options,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status} ${res.statusText}`.trim());
      }
      if (!res.body) {
        throw new Error("Ollama response had no body to stream");
      }

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
          if (line === "") continue;
          const parsed = parseLine(line);
          if (parsed?.message?.content) yield parsed.message.content;
          if (parsed?.done) return;
        }
      }

      const tail = buf.trim();
      if (tail !== "") {
        const parsed = parseLine(tail);
        if (parsed?.message?.content) yield parsed.message.content;
      }
    },
  };
}

function parseLine(line: string): OllamaChatLine | undefined {
  try {
    return JSON.parse(line) as OllamaChatLine;
  } catch {
    // Ollama emits one JSON object per line; ignore malformed partials.
    return undefined;
  }
}
