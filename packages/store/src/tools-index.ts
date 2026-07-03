import type { MemoryStore, Brief } from "../../engine/src/index.ts";

/**
 * Multi-tool workshop (H9.1) — list the tools a user has built (each persists a
 * `<id>:brief`), and remember which one was open last so a returning user lands
 * back on it. All local.
 */
const LAST_ACTIVE = "workshop:lastActiveTool";

export async function listSavedTools(
  store: MemoryStore,
): Promise<{ id: string; goal: string }[]> {
  const keys = await store.keys();
  const out: { id: string; goal: string }[] = [];
  for (const k of keys) {
    if (!k.endsWith(":brief")) continue;
    const id = k.slice(0, -":brief".length);
    if (!id || id.includes(":")) continue;
    const brief = await store.get<Brief>(k);
    out.push({ id, goal: brief?.goal ?? id });
  }
  return out;
}

export async function getLastActiveTool(store: MemoryStore): Promise<string | undefined> {
  return store.get<string>(LAST_ACTIVE);
}

export async function setLastActiveTool(store: MemoryStore, id: string): Promise<void> {
  await store.set(LAST_ACTIVE, id);
}
