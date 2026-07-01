/**
 * Capability packs (DESIGN.md -> "downloadable offline capability packs"). A
 * pack bundles reusable starter templates (and, later, archetypes/libraries) so
 * the builder starts from more than a blank page. Packs are fetched or
 * sideloaded once, then work fully offline. Metadata biases toward permissive
 * licenses so redistribution stays clean.
 */

export interface PackTemplate {
  /** Tool-kind or name this template starts (e.g. "list", "timer"). */
  readonly kind: string;
  readonly description: string;
  /** path -> source for the starter tool. */
  readonly files: Readonly<Record<string, string>>;
}

export interface CapabilityPack {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly templates: readonly PackTemplate[];
}

/** The pack registry seam the engine depends on (implemented by @maker/store). */
export interface PackRegistry {
  install(pack: CapabilityPack): Promise<void>;
  list(): Promise<readonly CapabilityPack[]>;
  templateFor(kind: string): Promise<PackTemplate | undefined>;
}

/** Parse + validate a pack for safe (side)loading. */
export function parsePack(json: string): CapabilityPack | undefined {
  try {
    const raw: unknown = JSON.parse(json);
    if (raw === null || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    if (typeof o["id"] !== "string" || typeof o["name"] !== "string") return undefined;

    const templates: PackTemplate[] = [];
    if (Array.isArray(o["templates"])) {
      for (const t of o["templates"]) {
        if (t === null || typeof t !== "object") continue;
        const to = t as Record<string, unknown>;
        if (typeof to["kind"] !== "string") continue;
        if (to["files"] === null || typeof to["files"] !== "object") continue;
        templates.push({
          kind: to["kind"],
          description: typeof to["description"] === "string" ? to["description"] : "",
          files: to["files"] as Record<string, string>,
        });
      }
    }
    return {
      id: o["id"],
      name: o["name"],
      version: typeof o["version"] === "string" ? o["version"] : "0.0.0",
      description: typeof o["description"] === "string" ? o["description"] : "",
      license: typeof o["license"] === "string" ? o["license"] : "unknown",
      templates,
    };
  } catch {
    return undefined;
  }
}
