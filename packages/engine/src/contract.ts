import type { Brief } from "./interfaces/brief.ts";

/**
 * Tool contracts (DESIGN.md -> "Composition & memory"). Every tool exposes a
 * contract derived from its Brief — what it is and what it *provides* — so other
 * tools can reference it and Maker can wire composition conversationally. The
 * model may refine it with a reserved ```contract``` block.
 */

export interface Provision {
  readonly name: string;
  readonly description: string;
}

export interface ToolContract {
  readonly id: string;
  readonly name: string;
  readonly goal: string;
  /** What this tool offers other tools (data, capabilities). */
  readonly provides: readonly Provision[];
}

/** The registry seam the engine depends on (implemented by @maker/store). */
export interface ToolRegistry {
  register(contract: ToolContract): Promise<void>;
  list(): Promise<readonly ToolContract[]>;
}

export function parseContractBlock(
  modelText: string,
): Partial<ToolContract> | undefined {
  const m = /```contract[^\n]*\n([\s\S]*?)```/.exec(modelText);
  if (!m) return undefined;
  try {
    const raw: unknown = JSON.parse(m[1] ?? "");
    if (typeof raw !== "object" || raw === null) return undefined;
    const o = raw as Record<string, unknown>;
    const patch: Partial<ToolContract> = {};
    if (typeof o["name"] === "string") patch.name = o["name"];
    if (typeof o["goal"] === "string") patch.goal = o["goal"];
    if (Array.isArray(o["provides"])) {
      const provides: Provision[] = [];
      for (const p of o["provides"]) {
        if (typeof p === "string") {
          provides.push({ name: p, description: "" });
        } else if (p !== null && typeof p === "object") {
          const po = p as Record<string, unknown>;
          if (typeof po["name"] === "string") {
            provides.push({
              name: po["name"],
              description: typeof po["description"] === "string" ? po["description"] : "",
            });
          }
        }
      }
      patch.provides = provides;
    }
    return patch;
  } catch {
    return undefined;
  }
}

export function deriveContract(
  id: string,
  brief: Brief,
  name: string,
  patch?: Partial<ToolContract>,
): ToolContract {
  const provides =
    patch?.provides && patch.provides.length > 0
      ? patch.provides
      : [{ name: "data", description: "the tool's saved data" }];
  return {
    id,
    name: patch?.name ?? name,
    goal: patch?.goal ?? brief.goal,
    provides,
  };
}
