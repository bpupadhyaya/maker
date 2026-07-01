import type {
  InferenceBackend,
  GenerateRequest,
} from "../interfaces/inference.ts";

export interface EchoOptions {
  /** Prefix prepended to the echoed reply. */
  readonly prefix?: string;
}

/**
 * A no-op InferenceBackend for M0.1. It "generates" by echoing the last user
 * message back one word at a time — proving the streaming Session contract end
 * to end without a real model. Swapped for Ollama (a real local model) in M0.2;
 * because both satisfy InferenceBackend, nothing upstream changes.
 */
export function echoInference(opts: EchoOptions = {}): InferenceBackend {
  const prefix = opts.prefix ?? "echo: ";
  return {
    name: "echo",
    async isAvailable() {
      return true;
    },
    async *generate(req: GenerateRequest): AsyncIterable<string> {
      const lastUser = [...req.messages]
        .reverse()
        .find((m) => m.role === "user");
      const text = prefix + (lastUser?.content ?? "");
      const words = text.split(" ");
      for (let i = 0; i < words.length; i++) {
        const word = words[i] ?? "";
        yield i === 0 ? word : " " + word;
      }
    },
  };
}
