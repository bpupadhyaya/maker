import type { MemoryStore } from "../../engine/src/index.ts";

/**
 * The local user profile (H5.1) — chosen roles + an "onboarded" flag, stored in
 * the app space via the MemoryStore. Drives personalization (starters, gap
 * emphasis). Nothing leaves the device.
 */
const ROLES_KEY = "profile:roles";
const ONBOARDED_KEY = "profile:onboarded";

export async function getRoles(store: MemoryStore): Promise<string[]> {
  return (await store.get<string[]>(ROLES_KEY)) ?? [];
}

export async function setRoles(store: MemoryStore, roles: string[]): Promise<void> {
  await store.set(ROLES_KEY, roles);
  await store.set(ONBOARDED_KEY, true);
}

export async function isOnboarded(store: MemoryStore): Promise<boolean> {
  return (await store.get<boolean>(ONBOARDED_KEY)) === true;
}

export async function markOnboarded(store: MemoryStore): Promise<void> {
  await store.set(ONBOARDED_KEY, true);
}
