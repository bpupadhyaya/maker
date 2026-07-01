/**
 * Local, offline key-value persistence rooted in the Maker home (~/.maker).
 *
 * Backs session/tool/Brief persistence (M0.7) and, later, the three cross-tool
 * memory layers (you / your tools / decisions & patterns). Nothing here ever
 * leaves the device — privacy is a property of the interface's only backing.
 */
export interface MemoryStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<readonly string[]>;
}
