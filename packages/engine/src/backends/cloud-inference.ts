import type {
  InferenceBackend,
  GenerateRequest,
} from "../interfaces/inference.ts";
import type { FetchLike } from "./ollama-inference.ts";

/**
 * Optional cloud backend (DESIGN.md -> "optional connect ... strictly opt-in,
 * off by default, never required"). An OpenAI-compatible streaming adapter for
 * the hard 20% a local model can't reach. It is ALWAYS wrapped in optInBackend
 * so it can't run unless the user explicitly connects. A real call needs an API
 * key + network (needs-user); the pipeline is ready.
 */
export interface CloudOptions {
  readonly baseUrl?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly fetch?: FetchLike;
}

export function cloudInference(opts: CloudOptions = {}): InferenceBackend {
  const baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
  const model = opts.model ?? "gpt-4o-mini";
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));

  return {
    name: "cloud",
    async isAvailable() {
      return Boolean(opts.apiKey);
    },
    async *generate(req: GenerateRequest): AsyncIterable<string> {
      const res = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
      if (!res.ok) throw new Error(`Cloud HTTP ${res.status} ${res.statusText}`.trim());
      if (!res.body) throw new Error("Cloud response had no body to stream");

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

export interface OptInController {
  /** The gated backend to hand to createMaker. */
  readonly backend: InferenceBackend;
  connect(): void;
  disconnect(): void;
  readonly connected: boolean;
}

/**
 * Wrap a backend so it only runs when explicitly connected — the opt-in gate
 * that keeps "online is never required" true. Off by default.
 */
export function optInBackend(inner: InferenceBackend): OptInController {
  let on = false;
  const backend: InferenceBackend = {
    name: `${inner.name} (opt-in)`,
    async isAvailable() {
      return on && (await inner.isAvailable());
    },
    async *generate(req: GenerateRequest): AsyncIterable<string> {
      if (!on) {
        throw new Error(
          `${inner.name} is not connected — cloud is opt-in and off by default`,
        );
      }
      yield* inner.generate(req);
    },
  };
  return {
    backend,
    connect() {
      on = true;
    },
    disconnect() {
      on = false;
    },
    get connected() {
      return on;
    },
  };
}
