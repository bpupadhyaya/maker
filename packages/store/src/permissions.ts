import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * Folder write-permissions (like Claude Code asking before touching a folder).
 * Maker won't write to disk without a grant; the user approves a folder, and
 * that grant covers it and its subfolders. Stored locally.
 */
const KEY = "permissions:folders";

function norm(dir: string): string {
  return dir.replace(/\/+$/, "");
}

export async function listGrantedPaths(store: MemoryStore): Promise<string[]> {
  return (await store.get<string[]>(KEY)) ?? [];
}

export async function grantPath(store: MemoryStore, dir: string): Promise<void> {
  const granted = await listGrantedPaths(store);
  const d = norm(dir);
  if (!granted.includes(d)) {
    granted.push(d);
    await store.set(KEY, granted);
  }
}

export async function revokePath(store: MemoryStore, dir: string): Promise<void> {
  const granted = (await listGrantedPaths(store)).filter((g) => g !== norm(dir));
  await store.set(KEY, granted);
}

/** Is `dir` (or an ancestor of it) already granted? */
export async function isGranted(store: MemoryStore, dir: string): Promise<boolean> {
  const d = norm(dir);
  for (const g of await listGrantedPaths(store)) {
    if (d === g || d.startsWith(g + "/")) return true;
  }
  return false;
}
