import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { MemoryStore } from "../../engine/src/index.ts";

/** The Maker home directory (~/.maker), overridable via MAKER_HOME for tests. */
export function makerHome(): string {
  return process.env["MAKER_HOME"] ?? path.join(os.homedir(), ".maker");
}

export interface FileStoreOptions {
  /** Directory to store JSON records. Defaults to <makerHome>/store. */
  readonly dir?: string;
}

/**
 * The M0.7 MemoryStore: one JSON file per key under the Maker home. Local,
 * offline, and the sole backing of Maker's memory — so "nothing leaves the
 * device" is a property of this being the only implementation, not a policy.
 */
export function fileMemoryStore(opts: FileStoreOptions = {}): MemoryStore {
  const dir = opts.dir ?? path.join(makerHome(), "store");
  const fileFor = (key: string): string =>
    path.join(dir, encodeURIComponent(key) + ".json");

  return {
    async get<T>(key: string): Promise<T | undefined> {
      try {
        return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
      } catch {
        return undefined;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fileFor(key), JSON.stringify(value, null, 2), "utf8");
    },

    async delete(key: string): Promise<void> {
      await fs.rm(fileFor(key), { force: true });
    },

    async keys(prefix?: string): Promise<readonly string[]> {
      let names: string[];
      try {
        names = await fs.readdir(dir);
      } catch {
        return [];
      }
      const keys = names
        .filter((n) => n.endsWith(".json"))
        .map((n) => decodeURIComponent(n.slice(0, -".json".length)));
      return prefix === undefined ? keys : keys.filter((k) => k.startsWith(prefix));
    },
  };
}
