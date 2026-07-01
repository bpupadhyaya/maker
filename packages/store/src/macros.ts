import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Custom slash commands / macros (H5.4) — user-defined shortcuts: /name expands
 * to a saved prompt and builds it. Stored in the app space, offline.
 */
const KEY = "macros:index";

export interface Macro {
  readonly name: string;
  readonly prompt: string;
}

async function all(store: MemoryStore): Promise<Record<string, string>> {
  return (await store.get<Record<string, string>>(KEY)) ?? {};
}

export async function setMacro(
  store: MemoryStore,
  name: string,
  prompt: string,
): Promise<void> {
  const m = await all(store);
  m[name] = prompt;
  await store.set(KEY, m);
}

export async function removeMacro(store: MemoryStore, name: string): Promise<boolean> {
  const m = await all(store);
  if (!(name in m)) return false;
  delete m[name];
  await store.set(KEY, m);
  return true;
}

export async function listMacros(store: MemoryStore): Promise<Macro[]> {
  return Object.entries(await all(store)).map(([name, prompt]) => ({ name, prompt }));
}

/** The saved prompt for a macro name, or undefined. */
export async function resolveMacro(
  store: MemoryStore,
  name: string,
): Promise<string | undefined> {
  return (await all(store))[name];
}
