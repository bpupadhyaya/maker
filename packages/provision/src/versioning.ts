import type { ModelEntry } from "./catalog.ts";
import { MODEL_CATALOG } from "./catalog.ts";

/**
 * Model auto-upgrade (DESIGN.md -> "local-model auto-upgrade without breaking
 * the offline guarantee"). The catalog can refresh online (optional); when a
 * newer version of the installed model appears, Maker *offers* an upgrade. It is
 * never forced — a user who never reconnects keeps working — so applying it (the
 * download) is needs-user; detecting it is offline.
 */

export interface InstalledModel {
  readonly id: string;
  readonly version: string;
}

/** Numeric dotted-version compare: -1 | 0 | 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** A newer catalog entry for the installed model, or undefined if up to date. */
export function upgradeAvailable(
  installed: InstalledModel,
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): ModelEntry | undefined {
  const entry = catalog.find((m) => m.id === installed.id);
  if (!entry) return undefined;
  return compareVersions(entry.version, installed.version) > 0 ? entry : undefined;
}
