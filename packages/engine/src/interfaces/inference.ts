import type { ChatMessage } from "../types.ts";

/** A single generation request to a backend. */
export interface GenerateRequest {
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}

/**
 * A local text-generation backend — llama.cpp, MLX, Ollama, or the echo stub.
 *
 * The engine depends ONLY on this interface; the concrete backend is chosen at
 * runtime by detected hardware/OS (the design's "per-device backends"). This is
 * the seam that keeps the rest of the engine OS-agnostic and lets us swap
 * Ollama (M0.2) for embedded llama.cpp/MLX later without touching callers.
 */
export interface InferenceBackend {
  /** Stable identifier, e.g. "echo", "ollama", "llama.cpp", "mlx". */
  readonly name: string;

  /** Whether this backend can run right now (model present, subprocess reachable). */
  isAvailable(): Promise<boolean>;

  /** Stream generated text chunks for the given request, in order. */
  generate(req: GenerateRequest): AsyncIterable<string>;
}
