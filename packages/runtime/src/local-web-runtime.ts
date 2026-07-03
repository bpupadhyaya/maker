import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  ToolRuntime,
  ToolSpec,
  BuiltTool,
  RunningTool,
} from "../../engine/src/index.ts";
import { serveDir } from "./static-server.ts";

export interface LocalWebRuntimeOptions {
  /** Where built tools live. Defaults to ~/.maker/tools. */
  readonly rootDir?: string;
  /** Bind host — loopback only by default (the tool never leaves the device). */
  readonly host?: string;
}

/**
 * The M0.4 ToolRuntime: builds a generated web/TS tool to disk and serves it on
 * a loopback port, returning a pokeable URL — fully offline, zero dependencies.
 * This is where the "always-runnable" invariant physically lives.
 *
 * Sandboxing (M0.4 level): writes are confined to the tool dir (path-traversal
 * at build time throws), the server refuses to serve outside the tool dir, and
 * it binds to loopback only. Stronger process isolation comes later.
 */
export function localWebRuntime(opts: LocalWebRuntimeOptions = {}): ToolRuntime {
  const rootDir = opts.rootDir ?? path.join(os.homedir(), ".maker", "tools");
  const host = opts.host ?? "127.0.0.1";

  return {
    async build(spec: ToolSpec): Promise<BuiltTool> {
      const dir = path.join(rootDir, spec.id);
      // Clear the tool dir but PRESERVE .rings (rewind snapshots must survive a rebuild).
      await fs.mkdir(dir, { recursive: true });
      for (const e of await fs.readdir(dir).catch(() => [])) {
        if (e === ".rings") continue;
        await fs.rm(path.join(dir, e), { recursive: true, force: true });
      }

      for (const [rel, content] of Object.entries(spec.files)) {
        const target = safeJoin(dir, rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf8");
      }

      return { id: spec.id, dir };
    },

    async run(tool: BuiltTool): Promise<RunningTool> {
      const server = http.createServer((req, res) => serveDir(tool.dir, req, res));
      await new Promise<void>((resolve) => server.listen(0, host, () => resolve()));

      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;

      return {
        id: tool.id,
        url: `http://${host}:${port}/`,
        stop: () =>
          new Promise<void>((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve())),
          ),
      };
    },

    // --- Rewind (H9.2): ring snapshots under <tool>/.rings/<n>/ ---
    async snapshot(id: string): Promise<void> {
      const dir = path.join(rootDir, id);
      const files = await readToolFiles(dir);
      if (Object.keys(files).length === 0) return; // nothing to snapshot yet
      const rings = await ringNumbers(dir);
      const n = (rings[rings.length - 1] ?? 0) + 1;
      const ringDir = path.join(dir, ".rings", String(n));
      await fs.mkdir(ringDir, { recursive: true });
      for (const [rel, content] of Object.entries(files)) {
        const target = safeJoin(ringDir, rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf8");
      }
      // Prune to the last RING_CAP.
      const all = await ringNumbers(dir);
      for (const old of all.slice(0, Math.max(0, all.length - RING_CAP))) {
        await fs.rm(path.join(dir, ".rings", String(old)), { recursive: true, force: true });
      }
    },
    async listRings(id: string): Promise<number[]> {
      return ringNumbers(path.join(rootDir, id));
    },
    async restoreRing(id: string, n: number): Promise<Record<string, string> | undefined> {
      const ringDir = path.join(rootDir, id, ".rings", String(n));
      const files = await readToolFiles(ringDir);
      return Object.keys(files).length ? files : undefined;
    },
    async dropRing(id: string, n: number): Promise<void> {
      await fs.rm(path.join(rootDir, id, ".rings", String(n)), { recursive: true, force: true });
    },
  };
}

const RING_CAP = 20;

/** Read a tool dir's files into a {relPath: content} map, skipping .rings. */
async function readToolFiles(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(cur: string, rel: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".rings") continue;
      const abs = path.join(cur, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(abs, r);
      else if (e.isFile()) out[r] = await fs.readFile(abs, "utf8");
    }
  }
  await walk(dir, "");
  return out;
}

async function ringNumbers(dir: string): Promise<number[]> {
  try {
    const names = await fs.readdir(path.join(dir, ".rings"));
    return names.map((n) => Number(n)).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Resolve `rel` under `dir`, throwing if it would escape the tool directory. */
function safeJoin(dir: string, rel: string): string {
  const root = path.resolve(dir);
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`unsafe path escapes tool dir: ${rel}`);
  }
  return target;
}
