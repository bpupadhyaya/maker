import type { InferenceBackend } from "../interfaces/inference.ts";
import type { FetchLike } from "./ollama-inference.ts";
import { llamaCppInference } from "./llamacpp-inference.ts";

/**
 * The MLX backend for Apple Silicon (DESIGN.md -> "MLX on Mac ... fastest on
 * Apple Silicon"). `mlx_lm.server` exposes the same OpenAI-compatible streaming
 * API as llama-server, so this reuses that adapter but gates availability to
 * Apple Silicon. A running mlx_lm.server is needs-user; the seam is testable.
 */
export interface MlxOptions {
  readonly host?: string;
  readonly model?: string;
  readonly fetch?: FetchLike;
  /** Override the Apple-Silicon check (for tests). */
  readonly isAppleSilicon?: boolean;
}

const DEFAULT_HOST = "http://127.0.0.1:8081";

function detectAppleSilicon(): boolean {
  const p = (globalThis as { process?: { platform?: string; arch?: string } }).process;
  return p?.platform === "darwin" && p?.arch === "arm64";
}

export function mlxInference(opts: MlxOptions = {}): InferenceBackend {
  const inner = llamaCppInference({
    host: opts.host ?? DEFAULT_HOST,
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.fetch !== undefined ? { fetch: opts.fetch } : {}),
  });
  const onAppleSilicon = opts.isAppleSilicon ?? detectAppleSilicon();

  return {
    name: "mlx",
    async isAvailable() {
      if (!onAppleSilicon) return false; // MLX is Apple Silicon only
      return inner.isAvailable();
    },
    generate: inner.generate.bind(inner),
  };
}
