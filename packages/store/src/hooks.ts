import { spawn } from "node:child_process";
import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Hooks / automation (H5.6) — run a shell command on an engine event
 * (tool-running / tool-built / file-change). Stored locally; commands run
 * best-effort with the event context passed as MAKER_* env vars. Fully offline.
 */
export type HookEvent = "tool-running" | "tool-built" | "file-change";

export interface Hook {
  readonly id: string;
  readonly event: HookEvent;
  readonly command: string;
}

const KEY = "hooks:index";

async function index(store: MemoryStore): Promise<Record<string, Hook>> {
  return (await store.get<Record<string, Hook>>(KEY)) ?? {};
}

export async function addHook(
  store: MemoryStore,
  event: HookEvent,
  command: string,
): Promise<Hook> {
  const all = await index(store);
  let n = 1;
  let id = `${event}-${n}`;
  while (all[id]) id = `${event}-${++n}`;
  const hook: Hook = { id, event, command };
  all[id] = hook;
  await store.set(KEY, all);
  return hook;
}

export async function listHooks(store: MemoryStore): Promise<Hook[]> {
  return Object.values(await index(store));
}

export async function removeHook(store: MemoryStore, id: string): Promise<boolean> {
  const all = await index(store);
  if (!(id in all)) return false;
  delete all[id];
  await store.set(KEY, all);
  return true;
}

/** Run all hooks registered for an event, passing context as MAKER_* env vars. */
export async function runHooks(
  store: MemoryStore,
  event: HookEvent,
  context: Record<string, string> = {},
): Promise<void> {
  const hooks = (await listHooks(store)).filter((h) => h.event === event);
  const env: NodeJS.ProcessEnv = { ...process.env, MAKER_EVENT: event };
  for (const [k, v] of Object.entries(context)) env[`MAKER_${k.toUpperCase()}`] = v;
  await Promise.all(
    hooks.map(
      (h) =>
        new Promise<void>((resolve) => {
          try {
            const child = spawn(h.command, { shell: true, env, stdio: "ignore" });
            child.on("close", () => resolve());
            child.on("error", () => resolve());
          } catch {
            resolve();
          }
        }),
    ),
  );
}
