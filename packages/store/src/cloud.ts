import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * OPTIONAL cloud config (H9.9) — the user's own API providers, stored locally.
 * OFF by default: nothing cloud runs unless a provider is added AND the
 * escalation mode is not 'never'. The offline core never depends on this.
 * Keys live only on this device (in ~/.maker); never logged.
 */
export type EscalationMode = "never" | "auto" | "always";

export interface CloudProvider {
  id: string; // "openai" | "grok" | "custom" | ...
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface CloudConfig {
  providers: Record<string, CloudProvider>;
  mode: EscalationMode;
}

const KEY = "cloud:providers";

async function load(store: MemoryStore): Promise<CloudConfig> {
  const c = await store.get<CloudConfig>(KEY);
  return { providers: c?.providers ?? {}, mode: c?.mode ?? "never" };
}

export async function listProviders(store: MemoryStore): Promise<CloudProvider[]> {
  return Object.values((await load(store)).providers);
}

export async function getEscalationMode(store: MemoryStore): Promise<EscalationMode> {
  return (await load(store)).mode;
}

export async function setEscalationMode(store: MemoryStore, mode: EscalationMode): Promise<void> {
  const c = await load(store);
  c.mode = mode;
  await store.set(KEY, c);
}

export async function addProvider(store: MemoryStore, p: CloudProvider): Promise<void> {
  const c = await load(store);
  c.providers[p.id] = p;
  await store.set(KEY, c);
}

export async function removeProvider(store: MemoryStore, id: string): Promise<boolean> {
  const c = await load(store);
  if (!(id in c.providers)) return false;
  delete c.providers[id];
  await store.set(KEY, c);
  return true;
}

/** The provider that would answer an escalated turn (first configured). */
export async function activeProvider(store: MemoryStore): Promise<CloudProvider | undefined> {
  return (await listProviders(store))[0];
}

/** Redact the key for display/logging — never expose it. */
export function redact(p: CloudProvider): Omit<CloudProvider, "apiKey"> & { apiKey: string } {
  return { ...p, apiKey: p.apiKey ? "••••" + p.apiKey.slice(-4) : "(none)" };
}
