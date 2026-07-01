import type { MemoryStore, TasteMemory } from "../../engine/src/index.ts";

/**
 * Taste-memory (DESIGN.md -> "Composition & memory"): taste = accumulated
 * ratified decisions applied as defaults. Stored locally and globally (spanning
 * tools, not per-tool), it shrinks gap-detection's questions over time — a
 * decision made once is never asked again. Feeds detectGaps({ known }).
 */

const DECISIONS_KEY = "taste:decisions";
const PREFS_KEY = "taste:prefs";

/** Record that a gap was decided (id -> chosen value). */
export async function recordDecision(
  store: MemoryStore,
  gapId: string,
  value: string,
): Promise<void> {
  const decisions =
    (await store.get<Record<string, string>>(DECISIONS_KEY)) ?? {};
  decisions[gapId] = value;
  await store.set(DECISIONS_KEY, decisions);
}

/** The value chosen for a decided gap, if any. */
export async function getDecision(
  store: MemoryStore,
  gapId: string,
): Promise<string | undefined> {
  const decisions =
    (await store.get<Record<string, string>>(DECISIONS_KEY)) ?? {};
  return decisions[gapId];
}

/** All decided gap ids — pass as detectGaps({ known }) to skip them. */
export async function knownGapIds(store: MemoryStore): Promise<string[]> {
  const decisions =
    (await store.get<Record<string, string>>(DECISIONS_KEY)) ?? {};
  return Object.keys(decisions);
}

/** Record a free-form taste preference (e.g. "theme" -> "dark"). */
export async function recordTaste(
  store: MemoryStore,
  key: string,
  value: string,
): Promise<void> {
  const prefs = (await store.get<Record<string, string>>(PREFS_KEY)) ?? {};
  prefs[key] = value;
  await store.set(PREFS_KEY, prefs);
}

export async function getTaste(
  store: MemoryStore,
): Promise<Record<string, string>> {
  return (await store.get<Record<string, string>>(PREFS_KEY)) ?? {};
}

/** Adapt a MemoryStore into the engine's TasteMemory seam for createMaker. */
export function tasteMemory(store: MemoryStore): TasteMemory {
  return {
    knownGapIds: () => knownGapIds(store),
    recordDecision: (gapId, value) => recordDecision(store, gapId, value),
  };
}
