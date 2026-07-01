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
  /** Pinned checksum of the fetched artifact (filled in per real release). */
  readonly sha256?: string;
}

export const MODEL_CATALOG: readonly ModelEntry[] = [
  {
    id: "deepseek-coder-v2-lite",
    name: "DeepSeek-Coder V2 Lite (distilled)",
    tier: "low",
    minMemGB: 12,
    approxSizeGB: 7,
    license: "MIT",
    version: "2.0.0",
    source: "ollama:deepseek-coder-v2",
  },
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen2.5-Coder 7B",
    tier: "mid",
    minMemGB: 16,
    approxSizeGB: 5,
    license: "Apache-2.0",
    version: "2.5.0",
    source: "ollama:qwen2.5-coder:7b",
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen2.5-Coder 14B",
    tier: "high",
    minMemGB: 32,
    approxSizeGB: 9,
    license: "Apache-2.0",
    version: "2.5.0",
    source: "ollama:qwen2.5-coder:14b",
  },
  {
    id: "qwen2.5-coder-32b",
    name: "Qwen2.5-Coder 32B",
    tier: "workstation",
    minMemGB: 48,
    approxSizeGB: 20,
    license: "Apache-2.0",
    version: "2.5.0",
    source: "ollama:qwen2.5-coder:32b",
  },
];

/**
 * Pick the strongest catalog model whose RAM floor the machine clears. If none
 * fits (very low memory), fall back to the smallest and let the caller warn.
 */
export function selectModel(
  hw: Hardware,
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): ModelEntry {
  const fits = catalog.filter((m) => hw.totalMemGB >= m.minMemGB);
  if (fits.length === 0) {
    return [...catalog].sort((a, b) => a.minMemGB - b.minMemGB)[0] as ModelEntry;
  }
  return fits.reduce((a, b) => (b.minMemGB > a.minMemGB ? b : a));
}
