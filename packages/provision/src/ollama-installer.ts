import { spawn } from "node:child_process";
import type { ModelInstaller } from "./provisioner.ts";
import type { ModelEntry } from "./catalog.ts";

/**
 * A concrete ModelInstaller that provisions a model on the app's behalf by
 * driving Ollama — the user never types `ollama pull`. (v1 path; the long-term
 * design bundles a portable llama.cpp so no external runtime install is needed
 * and the app downloads only the model weights.) Requires Ollama present +
 * network at setup time: that's the one needs-user moment, and the *app* runs it.
 */
export function ollamaInstaller(): ModelInstaller {
  return {
    name: "ollama",

    async isInstalled(entry: ModelEntry): Promise<boolean> {
      const tag = ollamaTag(entry);
      try {
        const { stdout } = await run("ollama", ["list"]);
        // ollama list prints "name:tag ..." lines; match the base name.
        const base = tag.split(":")[0] ?? tag;
        return stdout.includes(base);
      } catch {
        return false; // ollama not present -> treat as not installed
      }
    },

    async install(
      entry: ModelEntry,
      onProgress?: (ratio: number, note: string) => void,
    ): Promise<void> {
      const tag = ollamaTag(entry);
      await pull(tag, onProgress);
    },
  };
}

function ollamaTag(entry: ModelEntry): string {
  return entry.source.startsWith("ollama:")
    ? entry.source.slice("ollama:".length)
    : entry.id;
}

function pull(
  tag: string,
  onProgress?: (ratio: number, note: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ollama", ["pull", tag]);
    let lastNote = `pulling ${tag}`;
    const onData = (buf: Buffer): void => {
      const text = buf.toString();
      // Ollama emits "... 42%" style progress on stderr.
      const pct = /(\d+)%/.exec(text);
      lastNote = text.trim().split("\n").at(-1) ?? lastNote;
      if (onProgress) onProgress(pct ? Number(pct[1]) / 100 : 0, lastNote);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => reject(e));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ollama pull exited ${code}`)),
    );
  });
}

function run(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => resolve({ stdout, code: code ?? 0 }));
  });
}
