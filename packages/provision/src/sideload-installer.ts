import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import type { ModelInstaller } from "./provisioner.ts";
import type { ModelEntry } from "./catalog.ts";

/**
 * Sideload path (DESIGN.md -> "first-class sideload fallback"). For
 * low-connectivity: the user gets the .gguf another way (USB / SD / a friend /
 * "Maker on a stick") and points Maker at it; the app copies it into the Maker
 * home and checksum-verifies. The required-online-once step never becomes
 * can't-start.
 */
function makerHomeDir(): string {
  return process.env["MAKER_HOME"] ?? path.join(os.homedir(), ".maker");
}

export function sideloadInstaller(
  srcPath: string,
  opts: { dir?: string } = {},
): ModelInstaller {
  const dir = opts.dir ?? path.join(makerHomeDir(), "models");
  const fileFor = (entry: ModelEntry): string => path.join(dir, `${entry.id}.gguf`);

  return {
    name: "sideload",

    async isInstalled(entry: ModelEntry): Promise<boolean> {
      try {
        await fs.access(fileFor(entry));
        return true;
      } catch {
        return false;
      }
    },

    async install(
      entry: ModelEntry,
      onProgress?: (ratio: number, note: string) => void,
    ): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
      onProgress?.(0, `copying ${path.basename(srcPath)}`);
      await fs.copyFile(srcPath, fileFor(entry));

      if (entry.sha256) {
        const buf = await fs.readFile(fileFor(entry));
        const digest = createHash("sha256").update(buf).digest("hex");
        if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
          await fs.rm(fileFor(entry), { force: true });
          throw new Error(`checksum mismatch for ${entry.name}`);
        }
      }
      onProgress?.(1, "copied");
    },
  };
}
