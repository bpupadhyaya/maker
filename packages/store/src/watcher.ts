import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryStore } from "../../engine/src/index.ts";
import { listGrantedPaths } from "./permissions.ts";
import { runHooks } from "./hooks.ts";

/**
 * File-change watcher (H9.6) — watch the user's GRANTED folders and fire the
 * hooks system on a 'file-change' event (with MAKER_PATH). Cheap + offline;
 * debounced; ignores .rings/node_modules/.git. `watch` is injectable for smoke.
 */
const IGNORE = /(^|[\\/])(\.rings|node_modules|\.git)([\\/]|$)/;

export interface WatcherOptions {
  /** Override the default action (which fires runHooks(store,'file-change',{path})). */
  readonly onChange?: (changedPath: string) => void;
  /** Injectable fs.watch (for smoke). */
  readonly watch?: typeof fs.watch;
  readonly debounceMs?: number;
}

export interface Watcher {
  readonly watching: readonly string[];
  stop(): void;
}

export async function startWatcher(
  store: MemoryStore,
  opts: WatcherOptions = {},
): Promise<Watcher> {
  const dirs = await listGrantedPaths(store);
  const watch = opts.watch ?? fs.watch;
  const debounceMs = opts.debounceMs ?? 300;
  const onChange =
    opts.onChange ?? ((p: string): void => void runHooks(store, "file-change", { path: p }));

  const watchers: fs.FSWatcher[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  for (const dir of dirs) {
    try {
      const w = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const rel = String(filename);
        if (IGNORE.test(rel)) return;
        const full = path.join(dir, rel);
        const prev = timers.get(full);
        if (prev) clearTimeout(prev);
        timers.set(
          full,
          setTimeout(() => {
            timers.delete(full);
            onChange(full);
          }, debounceMs),
        );
      });
      watchers.push(w);
    } catch {
      // Unwatchable dir (e.g. removed, or recursive unsupported) — skip it.
    }
  }
  return {
    watching: dirs,
    stop(): void {
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          /* already closed */
        }
      }
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
