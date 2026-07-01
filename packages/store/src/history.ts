import type { MemoryStore } from "../../engine/src/index.ts";
import { listTools } from "./contract-registry.ts";

/**
 * History + search (H5.7) — a local index of what you've done: the session
 * prompts you've typed and the tools you've built (from the registry). Keyword
 * search over both. Fully offline; capped so it stays small.
 */
const PROMPTS = "history:prompts";
const CAP = 300;

export interface HistoryHit {
  readonly kind: "prompt" | "tool";
  readonly text: string;
  readonly id?: string;
}

export async function recordPrompt(store: MemoryStore, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const arr = (await store.get<string[]>(PROMPTS)) ?? [];
  arr.push(t);
  await store.set(PROMPTS, arr.slice(-CAP));
}

export async function listPrompts(store: MemoryStore): Promise<string[]> {
  return (await store.get<string[]>(PROMPTS)) ?? [];
}

export async function historyOverview(
  store: MemoryStore,
): Promise<{ prompts: string[]; tools: { id: string; name: string; goal: string }[] }> {
  const tools = (await listTools(store)).map((t) => ({ id: t.id, name: t.name, goal: t.goal }));
  return { prompts: await listPrompts(store), tools };
}

/** Keyword search over recorded prompts AND built tools' contracts. */
export async function searchHistory(
  store: MemoryStore,
  query: string,
): Promise<HistoryHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: HistoryHit[] = [];
  for (const p of await listPrompts(store)) {
    if (p.toLowerCase().includes(q)) hits.push({ kind: "prompt", text: p });
  }
  for (const t of await listTools(store)) {
    const hay = `${t.name} ${t.goal} ${t.id}`.toLowerCase();
    if (hay.includes(q)) hits.push({ kind: "tool", text: `${t.name} — ${t.goal}`, id: t.id });
  }
  return hits;
}
