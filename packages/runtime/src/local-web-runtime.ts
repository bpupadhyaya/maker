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
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });

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
  };
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
