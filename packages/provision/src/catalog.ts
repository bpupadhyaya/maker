import type { Hardware, Tier } from "./hardware.ts";

/**
 * The curated model catalog — metadata only, no weights (DESIGN.md -> "The model
 * is fetched, never bundled"). The installer ships this; first-run downloads the
 * tier-matched default from its official source, checksum-verified. Licenses are
 * biased toward permissive (MIT/Apache-2.0) so redistribution is never a concern.
 */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly tier: Tier;
  /** Minimum RAM to run this comfortably. */
  readonly minMemGB: number;
  readonly approxSizeGB: number;
  readonly license: string;
  /** Catalog version of this entry — drives auto-upgrade offers. */
  readonly version: string;
  /** Official source (e.g. an Ollama tag or a Hugging Face URL). */
  readonly source: string;
  /** Ollama tag, if available (e.g. "qwen2.5-coder:7b"). */
  readonly ollama?: string;
  /** Direct GGUF download URL (llama.cpp path — needs only network, no Ollama). */
  readonly gguf?: string;
  /** MLX repo id for Apple Silicon (e.g. "mlx-community/..."). */
  readonly mlx?: string;
  /** The default pick for this tier. */
  readonly recommended?: boolean;
  /** Pinned checksum of the fetched artifact (filled in per real release). */
  readonly sha256?: string;
  /** Vision model — can read images. Requires an `mmproj` projector alongside the gguf. */
  readonly vision?: boolean;
  /** GGUF URL of the vision projector (mmproj), downloaded next to the model. */
  readonly mmproj?: string;
}

/**
 * A broad, open-source catalog across tiers. Each entry lists its integration
 * options: an Ollama tag, a direct GGUF URL (llama.cpp path), and an MLX repo
 * (Apple Silicon). GGUF URLs use the Hugging Face `resolve` pattern with a
 * representative Q4_K_M quant. The low/mid-tier default filenames below are the
 * real bartowski GGUF names; their `sha256` is intentionally left undefined so
 * the installer uses **trust-on-first-use** (records the digest on first download,
 * verifies re-downloads against it). Pinning exact sha256 per release = needs-user.
 * Licenses noted honestly (some are non-permissive).
 */
const HF = "https://huggingface.co";
export const MODEL_CATALOG: readonly ModelEntry[] = [
  // ── low tier (≈12GB) — real bartowski filenames, sha256 = trust-on-first-use ──
  {
    id: "qwen2.5-coder-3b", name: "Qwen2.5-Coder 3B", tier: "low",
    minMemGB: 12, approxSizeGB: 2, license: "Apache-2.0", version: "2.5.0",
    source: "ollama:qwen2.5-coder:3b", ollama: "qwen2.5-coder:3b",
    gguf: `${HF}/bartowski/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit", recommended: true,
  },
  {
    id: "qwen2.5-coder-1.5b", name: "Qwen2.5-Coder 1.5B", tier: "low",
    minMemGB: 8, approxSizeGB: 1, license: "Apache-2.0", version: "2.5.0",
    source: "ollama:qwen2.5-coder:1.5b", ollama: "qwen2.5-coder:1.5b",
    gguf: `${HF}/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Qwen2.5-Coder-1.5B-Instruct-4bit",
  },
  {
    id: "deepseek-coder-v2-lite", name: "DeepSeek-Coder V2 Lite", tier: "low",
    minMemGB: 12, approxSizeGB: 6, license: "MIT (DeepSeek)", version: "2.0.0",
    source: "ollama:deepseek-coder-v2", ollama: "deepseek-coder-v2:16b",
    gguf: `${HF}/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit",
  },
  {
    id: "phi-4-mini", name: "Phi-4 Mini", tier: "low",
    minMemGB: 10, approxSizeGB: 3, license: "MIT", version: "4.0.0",
    source: "ollama:phi4-mini", ollama: "phi4-mini",
    gguf: `${HF}/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Phi-4-mini-instruct-4bit",
  },
  {
    id: "llama-3.2-3b", name: "Llama 3.2 3B", tier: "low",
    minMemGB: 10, approxSizeGB: 2, license: "Llama 3.2 Community", version: "3.2.0",
    source: "ollama:llama3.2:3b", ollama: "llama3.2:3b",
    gguf: `${HF}/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Llama-3.2-3B-Instruct-4bit",
  },
  {
    id: "gemma-2-2b", name: "Gemma 2 2B", tier: "low",
    minMemGB: 8, approxSizeGB: 2, license: "Gemma Terms", version: "2.0.0",
    source: "ollama:gemma2:2b", ollama: "gemma2:2b",
    gguf: `${HF}/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf`,
    mlx: "mlx-community/gemma-2-2b-it-4bit",
  },
  {
    id: "starcoder2-3b", name: "StarCoder2 3B", tier: "low",
    minMemGB: 10, approxSizeGB: 2, license: "BigCode OpenRAIL-M", version: "2.0.0",
    source: "ollama:starcoder2:3b", ollama: "starcoder2:3b",
    gguf: `${HF}/second-state/StarCoder2-3B-GGUF/resolve/main/starcoder2-3b-Q4_K_M.gguf`,
  },

  // ── mid tier (≈16GB) ─────────────────────────────────────────────
  {
    id: "qwen2.5-coder-7b", name: "Qwen2.5-Coder 7B", tier: "mid",
    minMemGB: 16, approxSizeGB: 5, license: "Apache-2.0", version: "2.5.0",
    source: "ollama:qwen2.5-coder:7b", ollama: "qwen2.5-coder:7b",
    gguf: `${HF}/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit", recommended: true,
  },
  {
    id: "codellama-7b", name: "Code Llama 7B", tier: "mid",
    minMemGB: 16, approxSizeGB: 4, license: "Llama 2 Community", version: "1.0.0",
    source: "ollama:codellama:7b", ollama: "codellama:7b",
    gguf: `${HF}/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf`,
    mlx: "mlx-community/CodeLlama-7b-Instruct-hf-4bit-mlx",
  },
  {
    id: "mistral-7b", name: "Mistral 7B Instruct", tier: "mid",
    minMemGB: 16, approxSizeGB: 4, license: "Apache-2.0", version: "0.3.0",
    source: "ollama:mistral:7b", ollama: "mistral:7b",
    gguf: `${HF}/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf`,
    mlx: "mlx-community/Mistral-7B-Instruct-v0.3-4bit",
  },
  {
    id: "llama-3.1-8b", name: "Llama 3.1 8B", tier: "mid",
    minMemGB: 16, approxSizeGB: 5, license: "Llama 3.1 Community", version: "3.1.0",
    source: "ollama:llama3.1:8b", ollama: "llama3.1:8b",
    gguf: `${HF}/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit",
  },
  {
    id: "granite-code-8b", name: "IBM Granite Code 8B", tier: "mid",
    minMemGB: 16, approxSizeGB: 5, license: "Apache-2.0", version: "3.0.0",
    source: "ollama:granite-code:8b", ollama: "granite-code:8b",
    gguf: `${HF}/ibm-granite/granite-8b-code-instruct-4k-GGUF/resolve/main/granite-8b-code-instruct-4k.Q4_K_M.gguf`,
  },
  {
    id: "yi-coder-9b", name: "Yi-Coder 9B", tier: "mid",
    minMemGB: 20, approxSizeGB: 6, license: "Apache-2.0", version: "1.5.0",
    source: "ollama:yi-coder:9b", ollama: "yi-coder:9b",
    gguf: `${HF}/bartowski/Yi-Coder-9B-Chat-GGUF/resolve/main/Yi-Coder-9B-Chat-Q4_K_M.gguf`,
    mlx: "mlx-community/Yi-Coder-9B-Chat-4bit",
  },

  // ── high tier (≈32GB) ────────────────────────────────────────────
  {
    id: "qwen2.5-coder-14b", name: "Qwen2.5-Coder 14B", tier: "high",
    minMemGB: 32, approxSizeGB: 9, license: "Apache-2.0", version: "2.5.0",
    source: "ollama:qwen2.5-coder:14b", ollama: "qwen2.5-coder:14b",
    gguf: `${HF}/bartowski/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit", recommended: true,
  },
  {
    id: "devstral-small", name: "Devstral Small (24B)", tier: "high",
    minMemGB: 32, approxSizeGB: 14, license: "Apache-2.0", version: "1.0.0",
    source: "ollama:devstral", ollama: "devstral",
    gguf: `${HF}/mistralai/Devstral-Small-2505_gguf/resolve/main/Devstral-Small-2505-Q4_K_M.gguf`,
    mlx: "mlx-community/Devstral-Small-2505-4bit",
  },
  {
    id: "codestral-22b", name: "Codestral 22B", tier: "high",
    minMemGB: 32, approxSizeGB: 13, license: "MNPL (non-commercial)", version: "0.1.0",
    source: "ollama:codestral", ollama: "codestral",
    gguf: `${HF}/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf`,
    mlx: "mlx-community/Codestral-22B-v0.1-4bit",
  },
  {
    id: "gemma-2-27b", name: "Gemma 2 27B", tier: "high",
    minMemGB: 40, approxSizeGB: 16, license: "Gemma Terms", version: "2.0.0",
    source: "ollama:gemma2:27b", ollama: "gemma2:27b",
    gguf: `${HF}/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q4_K_M.gguf`,
    mlx: "mlx-community/gemma-2-27b-it-4bit",
  },
  {
    id: "starcoder2-15b", name: "StarCoder2 15B", tier: "high",
    minMemGB: 32, approxSizeGB: 9, license: "BigCode OpenRAIL-M", version: "2.0.0",
    source: "ollama:starcoder2:15b", ollama: "starcoder2:15b",
    gguf: `${HF}/second-state/StarCoder2-15B-GGUF/resolve/main/starcoder2-15b-Q4_K_M.gguf`,
  },

  // ── workstation tier (≈48GB+) ────────────────────────────────────
  {
    id: "qwen2.5-coder-32b", name: "Qwen2.5-Coder 32B", tier: "workstation",
    minMemGB: 48, approxSizeGB: 20, license: "Apache-2.0", version: "2.5.0",
    source: "ollama:qwen2.5-coder:32b", ollama: "qwen2.5-coder:32b",
    gguf: `${HF}/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit", recommended: true,
  },
  {
    id: "llama-3.3-70b", name: "Llama 3.3 70B", tier: "workstation",
    minMemGB: 64, approxSizeGB: 40, license: "Llama 3.3 Community", version: "3.3.0",
    source: "ollama:llama3.3", ollama: "llama3.3:70b",
    gguf: `${HF}/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf`,
    mlx: "mlx-community/Llama-3.3-70B-Instruct-4bit",
  },

  // ── vision models (read images) — need a model gguf + an mmproj projector ──
  // sha256 left undefined (trust-on-first-use); exact GGUF/mmproj filenames are
  // confirmed on a real download run (needs-user), like the other entries.
  {
    id: "moondream2", name: "Moondream2 (vision, 2B)", tier: "low",
    minMemGB: 8, approxSizeGB: 2, license: "Apache-2.0", version: "2.0.0",
    source: "hf:vikhyatk/moondream2", vision: true,
    gguf: `${HF}/vikhyatk/moondream2/resolve/main/moondream2-text-model-f16.gguf`,
    mmproj: `${HF}/vikhyatk/moondream2/resolve/main/moondream2-mmproj-f16.gguf`,
  },
  {
    id: "qwen2.5-vl-7b", name: "Qwen2.5-VL 7B (vision)", tier: "mid",
    minMemGB: 16, approxSizeGB: 6, license: "Apache-2.0", version: "2.5.0",
    source: "hf:ggml-org/Qwen2.5-VL-7B-Instruct-GGUF", vision: true,
    gguf: `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf`,
    mmproj: `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf`,
  },
];

/**
 * Pick the recommended model at the strongest tier the machine can run. Prefer
 * the tier's `recommended` entry; else the highest-RAM entry that fits. If none
 * fits (very low memory), fall back to the smallest and let the caller warn.
 */
export function selectModel(
  hw: Hardware,
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): ModelEntry {
  // Try the machine's tier, then step down; within a tier prefer `recommended`.
  const order: Tier[] = ["workstation", "high", "mid", "low"];
  const start = order.indexOf(hw.tier);
  const toTry = start >= 0 ? order.slice(start) : order;

  for (const tier of toTry) {
    const fits = catalog.filter(
      (m) => m.tier === tier && hw.totalMemGB >= m.minMemGB,
    );
    if (fits.length > 0) {
      return fits.find((m) => m.recommended) ?? (fits[0] as ModelEntry);
    }
  }
  // Nothing fits (very low memory): the smallest model, best-effort.
  return [...catalog].sort((a, b) => a.minMemGB - b.minMemGB)[0] as ModelEntry;
}

/** All models for a given tier (for a "choose another" list in the UI). */
export function modelsForTier(
  tier: Tier,
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): ModelEntry[] {
  return catalog.filter((m) => m.tier === tier);
}
