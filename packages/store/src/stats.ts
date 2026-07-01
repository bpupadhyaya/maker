import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Local usage stats (H5.9) — a privacy-safe, understated tally of your own use:
 * sessions, tools built, active days, and a rough token estimate. Stored in the
 * app space; NEVER leaves the device (the honest counterpart to a cloud
 * dashboard).
 */
const KEY = "stats:usage";

interface StatsRecord {
  sessions: number;
  toolsBuilt: number;
  tokens: number;
  activeDays: string[]; // YYYY-MM-DD, de-duplicated
  since: string | null;
}

export interface Stats {
  readonly sessions: number;
  readonly toolsBuilt: number;
  readonly tokens: number;
  readonly activeDays: number;
  readonly since: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function load(store: MemoryStore): Promise<StatsRecord> {
  return (
    (await store.get<StatsRecord>(KEY)) ?? {
      sessions: 0,
      toolsBuilt: 0,
      tokens: 0,
      activeDays: [],
      since: null,
    }
  );
}

async function bump(store: MemoryStore, fn: (r: StatsRecord) => void): Promise<void> {
  const r = await load(store);
  if (!r.since) r.since = today();
  const day = today();
  if (!r.activeDays.includes(day)) r.activeDays.push(day);
  fn(r);
  await store.set(KEY, r);
}

export async function recordSession(store: MemoryStore): Promise<void> {
  await bump(store, (r) => (r.sessions += 1));
}

export async function recordToolBuilt(store: MemoryStore): Promise<void> {
  await bump(store, (r) => (r.toolsBuilt += 1));
}

export async function recordTokens(store: MemoryStore, n: number): Promise<void> {
  await bump(store, (r) => (r.tokens += Math.max(0, Math.floor(n))));
}

export async function getStats(store: MemoryStore): Promise<Stats> {
  const r = await load(store);
  return {
    sessions: r.sessions,
    toolsBuilt: r.toolsBuilt,
    tokens: r.tokens,
    activeDays: r.activeDays.length,
    since: r.since,
  };
}
