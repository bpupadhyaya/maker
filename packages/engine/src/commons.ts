import type { ToolExport } from "./tool-export.ts";
import { importTool } from "./tool-export.ts";
import type { CapabilityPack } from "./pack.ts";
import type { ToolRuntime, RunningTool } from "./interfaces/tool-runtime.ts";

/**
 * The optional commons (DESIGN.md -> "a shared, privacy-preserving commons"). A
 * portable, JSON-serializable bundle of exported tools + capability packs that a
 * user can share and another can import — everything rebuilds locally and works
 * offline. Hosting/distribution of the commons is needs-user; the format and
 * import are here.
 */
export interface CommonsBundle {
  readonly version: string;
  readonly tools: readonly ToolExport[];
  readonly packs: readonly CapabilityPack[];
}

export function exportCommons(
  tools: readonly ToolExport[],
  packs: readonly CapabilityPack[],
): CommonsBundle {
  return { version: "1.0.0", tools, packs };
}

export interface ImportedCommons {
  /** The tools, rebuilt and running locally. */
  readonly tools: readonly RunningTool[];
  /** The packs (install via the caller's registry). */
  readonly packs: readonly CapabilityPack[];
}

/** Rebuild + run every tool in a commons bundle; return running tools + packs. */
export async function importCommons(
  bundle: CommonsBundle,
  runtime: ToolRuntime,
): Promise<ImportedCommons> {
  const tools: RunningTool[] = [];
  for (const t of bundle.tools) {
    tools.push(await importTool(t, runtime, t.name));
  }
  return { tools, packs: bundle.packs };
}
