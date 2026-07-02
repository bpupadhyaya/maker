import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import type { ModelInstaller } from "./provisioner.ts";
import type { ModelEntry } from "./catalog.ts";

/**
 * The llama.cpp path: download a model's GGUF weights directly (no Ollama). This
 * is the decided long-term default — the app ships a portable llama.cpp, so
 * `/setup` needs ONLY the network to fetch the weights, nothing pre-installed.
 * Streams to disk while hashing, then checksum-verifies. Fetch is injectable so
 * the flow is testable without a network.
 */
export interface GgufOptions {
  /** Where GGUF files live. Defaults to <makerHome>/models. */
  readonly dir?: string;
  readonly fetch?: (url: string) => Promise<Response>;
}

function makerHomeDir(): string {
  return process.env["MAKER_HOME"] ?? path.join(os.homedir(), ".maker");
}

export function ggufInstaller(opts: GgufOptions = {}): ModelInstaller {
  const dir = opts.dir ?? path.join(makerHomeDir(), "models");
  const doFetch = opts.fetch ?? ((u: string) => fetch(u));
  const fileFor = (entry: ModelEntry): string => path.join(dir, `${entry.id}.gguf`);
  const mmprojFor = (entry: ModelEntry): string => path.join(dir, `${entry.id}.mmproj.gguf`);

  // Stream one URL to `target`, checksum-verify (pinned or trust-on-first-use).
  async function downloadTo(
    url: string,
    target: string,
    label: string,
    pinnedSha: string | undefined,
    onProgress?: (ratio: number, note: string) => void,
  ): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    if (!res.body) throw new Error("download had no body to stream");

    const total = Number(res.headers.get("content-length") ?? 0);
    const partPath = target + ".part";
    const out = fs.createWriteStream(partPath);
    const hash = createHash("sha256");
    const reader = res.body.getReader();
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        hash.update(value);
        if (!out.write(value)) {
          await new Promise<void>((r) => out.once("drain", () => r()));
        }
        onProgress?.(total ? received / total : 0, `downloading ${label}`);
      }
    } finally {
      out.end();
    }
    await new Promise<void>((resolve, reject) => {
      out.on("finish", () => resolve());
      out.on("error", reject);
    });

    const digest = hash.digest("hex").toLowerCase();
    const sumPath = target + ".sha256";
    const pinned = pinnedSha?.toLowerCase();
    let expected = pinned;
    if (!expected) {
      try {
        expected = (await fsp.readFile(sumPath, "utf8")).trim().toLowerCase() || undefined;
      } catch {
        expected = undefined; // first-use: nothing recorded yet
      }
    }
    if (expected && digest !== expected) {
      await fsp.rm(partPath, { force: true });
      throw new Error(`checksum mismatch for ${label}`);
    }
    await fsp.rename(partPath, target);
    if (!pinned) await fsp.writeFile(sumPath, digest); // TOFU
  }

  return {
    name: "gguf",

    async isInstalled(entry: ModelEntry): Promise<boolean> {
      try {
        await fsp.access(fileFor(entry));
        // A vision model isn't usable without its projector.
        if (entry.mmproj) await fsp.access(mmprojFor(entry));
        return true;
      } catch {
        return false;
      }
    },

    async install(
      entry: ModelEntry,
      onProgress?: (ratio: number, note: string) => void,
    ): Promise<void> {
      if (!entry.gguf) throw new Error(`no GGUF url for ${entry.id}`);
      await downloadTo(entry.gguf, fileFor(entry), entry.name, entry.sha256, onProgress);
      // Vision models also need their mmproj projector.
      if (entry.mmproj) {
        await downloadTo(entry.mmproj, mmprojFor(entry), `${entry.name} vision projector`, undefined, onProgress);
      }
    },
  };
}
