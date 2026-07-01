import type { Brief } from "./interfaces/brief.ts";
import type { Check } from "./verification.ts";
import type { ToolContract } from "./contract.ts";
import type { ToolRuntime, RunningTool } from "./interfaces/tool-runtime.ts";

/**
 * A portable, JSON-serializable export of a tool — everything needed to run it
 * elsewhere and keep the collaboration honest: the code, the Brief, the checks
 * (the regression net), and the contract (what it provides). Sharing tools is
 * "take the code + Brief + checks and leave" made transferable.
 */
export interface ToolExport {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly brief: Brief;
  readonly checks: readonly Check[];
  readonly contract: ToolContract | undefined;
}

/** Rebuild and run an exported tool with a runtime — the import side. */
export async function importTool(
  exp: ToolExport,
  runtime: ToolRuntime,
  toolId?: string,
): Promise<RunningTool> {
  const id = toolId ?? exp.name;
  const built = await runtime.build({ id, files: exp.files });
  return runtime.run(built);
}
