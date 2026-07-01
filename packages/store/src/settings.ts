import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Settings / config (H5.8) — a small local config for model, effort, theme, and
 * approval mode. Stored in the app space (via the MemoryStore). Offline.
 */
export interface Settings {
  model: string;
  effort: "low" | "medium" | "high";
  theme: "dark" | "light";
  /** "auto" builds first; "ask" means confirm-before-build (interrogate more). */
  approvalMode: "auto" | "ask";
}

const KEY = "settings:config";

export const DEFAULT_SETTINGS: Settings = {
  model: "",
  effort: "medium",
  theme: "dark",
  approvalMode: "auto",
};

export async function getSettings(store: MemoryStore): Promise<Settings> {
  const saved = (await store.get<Partial<Settings>>(KEY)) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function setSetting(
  store: MemoryStore,
  key: keyof Settings,
  value: string,
): Promise<Settings> {
  const current = await getSettings(store);
  const next: Settings = { ...current, [key]: value } as Settings;
  await store.set(KEY, next);
  return next;
}
