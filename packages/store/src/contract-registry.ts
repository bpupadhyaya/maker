import type {
  MemoryStore,
  ToolContract,
  ToolRegistry,
} from "../../engine/src/index.ts";

/**
 * A local registry of tool contracts (backed by the MemoryStore) — the seed of
 * the tool ecosystem: a tool's Nth build starts from everything already made.
 */
const KEY = "registry:tools";

export async function registerTool(
  store: MemoryStore,
  contract: ToolContract,
): Promise<void> {
  const all = (await store.get<Record<string, ToolContract>>(KEY)) ?? {};
  all[contract.id] = contract;
  await store.set(KEY, all);
}

export async function listTools(store: MemoryStore): Promise<ToolContract[]> {
  const all = (await store.get<Record<string, ToolContract>>(KEY)) ?? {};
  return Object.values(all);
}

export async function getTool(
  store: MemoryStore,
  id: string,
): Promise<ToolContract | undefined> {
  const all = (await store.get<Record<string, ToolContract>>(KEY)) ?? {};
  return all[id];
}

/** Adapt a MemoryStore into the engine's ToolRegistry seam for createMaker. */
export function toolRegistry(store: MemoryStore): ToolRegistry {
  return {
    register: (contract) => registerTool(store, contract),
    list: () => listTools(store),
  };
}
