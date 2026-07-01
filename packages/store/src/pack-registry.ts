import type {
  MemoryStore,
  CapabilityPack,
  PackTemplate,
  PackRegistry,
} from "../../engine/src/index.ts";

/**
 * A local registry of installed capability packs (backed by the MemoryStore).
 * Installed once (fetched or sideloaded), available offline thereafter.
 */
const KEY = "packs:installed";

export async function installPack(
  store: MemoryStore,
  pack: CapabilityPack,
): Promise<void> {
  const all = (await store.get<Record<string, CapabilityPack>>(KEY)) ?? {};
  all[pack.id] = pack;
  await store.set(KEY, all);
}

export async function listPacks(
  store: MemoryStore,
): Promise<CapabilityPack[]> {
  const all = (await store.get<Record<string, CapabilityPack>>(KEY)) ?? {};
  return Object.values(all);
}

/** First installed template matching a tool-kind, if any. */
export async function templateFor(
  store: MemoryStore,
  kind: string,
): Promise<PackTemplate | undefined> {
  for (const pack of await listPacks(store)) {
    const t = pack.templates.find((tpl) => tpl.kind === kind);
    if (t) return t;
  }
  return undefined;
}

/** Adapt a MemoryStore into the engine's PackRegistry seam. */
export function packRegistry(store: MemoryStore): PackRegistry {
  return {
    install: (pack) => installPack(store, pack),
    list: () => listPacks(store),
    templateFor: (kind) => templateFor(store, kind),
  };
}
