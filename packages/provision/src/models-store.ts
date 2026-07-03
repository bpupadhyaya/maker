import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ModelEntry } from "./catalog.ts";
import { MODEL_CATALOG } from "./catalog.ts";

/**
 * Model storage management (DESIGN.md -> local-first). Models live ONLY in
 * Maker's own space — `MAKER_HOME/models` (default ~/.maker/models) — never
 * system-wide, so they can't collide with other apps and can be cleanly removed
 * to free space. Install (ggufInstaller/sideloadInstaller) writes here; this
 * module lists / measures / removes and tracks the active model.
 */
export function makerHomeDir(): string {
  return process.env["MAKER_HOME"] ?? path.join(os.homedir(), ".maker");
}
export function modelsDir(): string {
  return path.join(makerHomeDir(), "models");
}
/** Path to a model's vision projector (mmproj), if it's a vision model. */
export function mmprojPath(id: string): string {
  return path.join(modelsDir(), `${id}.mmproj.gguf`);
}

export interface InstalledModel {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly path: string;
}

/** List models installed in the app space (scans MAKER_HOME/models for *.gguf). */
export async function listInstalledModels(
  catalog: readonly ModelEntry[] = MODEL_CATALOG,
): Promise<InstalledModel[]> {
  const dir = modelsDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: InstalledModel[] = [];
  for (const n of names) {
    if (!n.endsWith(".gguf")) continue;
    if (n.endsWith(".mmproj.gguf")) continue; // a vision projector, not a model
    const id = n.slice(0, -".gguf".length);
    const p = path.join(dir, n);
    let sizeBytes = 0;
    try {
      sizeBytes = (await fs.stat(p)).size;
    } catch {
      // skip unreadable
    }
    const entry = catalog.find((m) => m.id === id);
    out.push({ id, name: entry?.name ?? id, sizeBytes, path: p });
  }
  return out;
}

/** Total bytes used by installed models in the app space. */
export async function modelDiskUsage(): Promise<number> {
  const models = await listInstalledModels();
  return models.reduce((sum, m) => sum + m.sizeBytes, 0);
}

/** Remove a model cleanly (weights + any sidecars); clears it as active. */
export async function removeModel(id: string): Promise<boolean> {
  const dir = modelsDir();
  const main = path.join(dir, `${id}.gguf`);
  let existed = false;
  try {
    await fs.access(main);
    existed = true;
  } catch {
    // not installed
  }
  for (const t of [
    `${id}.gguf`, `${id}.gguf.part`, `${id}.gguf.sha256`, `${id}.json`,
    `${id}.mmproj.gguf`, `${id}.mmproj.gguf.part`, `${id}.mmproj.gguf.sha256`,
  ]) {
    await fs.rm(path.join(dir, t), { force: true });
  }
  if ((await getActiveModel()) === id) await setActiveModel(undefined);
  return existed;
}

/** Remove ALL installed models (frees all model disk); clears the active model. */
export async function removeAllModels(): Promise<{
  removed: number;
  freedBytes: number;
}> {
  const before = await listInstalledModels();
  const freedBytes = before.reduce((sum, m) => sum + m.sizeBytes, 0);
  for (const m of before) await removeModel(m.id);
  return { removed: before.length, freedBytes };
}

/**
 * Full reset — wipe ALL of Maker's app data (models, built tools, memory, active
 * model) under MAKER_HOME. A clean slate; the app stays installed. Reports the
 * freed model space (the meaningful part). To also remove the app itself, use
 * the platform uninstaller.
 */
export async function resetMakerData(): Promise<{ freedBytes: number }> {
  const freedBytes = await modelDiskUsage();
  await fs.rm(makerHomeDir(), { recursive: true, force: true });
  return { freedBytes };
}

function activeFile(): string {
  return path.join(makerHomeDir(), "active-model.json");
}

/** The model id the user chose to use, if any. */
export async function getActiveModel(): Promise<string | undefined> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(activeFile(), "utf8"));
    if (raw !== null && typeof raw === "object") {
      const id = (raw as Record<string, unknown>)["id"];
      if (typeof id === "string") return id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function setActiveModel(id: string | undefined): Promise<void> {
  await fs.mkdir(makerHomeDir(), { recursive: true });
  if (id === undefined) {
    await fs.rm(activeFile(), { force: true });
    return;
  }
  await fs.writeFile(activeFile(), JSON.stringify({ id }, null, 2), "utf8");
}
