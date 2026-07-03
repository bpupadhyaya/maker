import * as fs from "node:fs/promises";
import * as path from "node:path";
import { modelsDir, getActiveModel, mmprojPath } from "./models-store.ts";
import { ensureRuntime as realEnsureRuntime, runtimeOverride } from "./runtime-installer.ts";
import { startLlamaServer as realStartServer, getFreePort } from "./server-manager.ts";
import type { RunningServer } from "./server-manager.ts";
import { provisionModel as realProvisionModel } from "./provisioner.ts";
import type { ProvisionOptions, ProvisionResult, ProgressFn } from "./provisioner.ts";

/**
 * Turnkey wire (H6.3) — the glue that makes "download the model, the app does the
 * rest" literally true: resolve the active model's GGUF, ensure the llama.cpp
 * runtime is present (fetching it if needed), start llama-server pointed at the
 * model, and hand back its URL. The front-ends point llamaCppInference at that
 * URL. Returns null (not an error) when there's nothing to run — no active model,
 * the GGUF isn't downloaded, or the user chose Ollama — so callers fall back
 * cleanly. ensureRuntime/startServer are injectable for tests.
 */
export interface StartModelRuntimeOptions {
  readonly port?: number;
  readonly onProgress?: (message: string) => void;
  readonly ensureRuntime?: typeof realEnsureRuntime;
  readonly startServer?: typeof realStartServer;
  /** Start THIS model instead of the active one (H9.3 vision routing). */
  readonly modelId?: string;
}

export interface ModelRuntime {
  readonly url: string;
  readonly modelId: string;
  stop(): void;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Whether we should fetch our own llama.cpp runtime (vs. Ollama / user's own). */
export function shouldFetchRuntime(): boolean {
  return process.env["MAKER_BACKEND"] !== "ollama" && !runtimeOverride();
}

export interface ProvisionAllOptions extends ProvisionOptions {
  /** Injectable for tests. */
  readonly provisionModel?: typeof realProvisionModel;
  readonly ensureRuntime?: typeof realEnsureRuntime;
}

export interface ProvisionAllResult {
  readonly model: ProvisionResult;
  readonly runtime: { ok: boolean; detail: string };
}

/**
 * The one guided online step (H7.3): download the MODEL, then the llama.cpp
 * RUNTIME — so after this the app runs fully offline with nothing else to
 * install. Skips the runtime fetch for Ollama / a user-provided MAKER_RUNTIME.
 * The runtime fetch is non-fatal: a downloaded model still works via sideload/
 * Ollama if the runtime couldn't be fetched.
 */
export async function provisionModelAndRuntime(
  opts: ProvisionAllOptions,
): Promise<ProvisionAllResult> {
  const provision = opts.provisionModel ?? realProvisionModel;
  const ensure = opts.ensureRuntime ?? realEnsureRuntime;
  const report: ProgressFn = opts.onProgress ?? ((): void => {});

  const model = await provision({
    installer: opts.installer,
    ...(opts.hardware ? { hardware: opts.hardware } : {}),
    ...(opts.catalog ? { catalog: opts.catalog } : {}),
    onProgress: report,
  });
  if (!model.ok) return { model, runtime: { ok: false, detail: "skipped — model download failed" } };

  if (!shouldFetchRuntime()) {
    return { model, runtime: { ok: true, detail: "using Ollama / your MAKER_RUNTIME" } };
  }
  try {
    await ensure({ onProgress: (p) => report({ phase: "install", message: p.message, ...(p.ratio !== undefined ? { ratio: p.ratio } : {}) }) });
    return { model, runtime: { ok: true, detail: "llama.cpp runtime ready" } };
  } catch (e) {
    return { model, runtime: { ok: false, detail: String(e) } };
  }
}

export async function startModelRuntime(
  opts: StartModelRuntimeOptions = {},
): Promise<ModelRuntime | null> {
  // Ollama manages its own server — not our job to run llama-server.
  if (process.env["MAKER_BACKEND"] === "ollama") return null;

  const modelId = opts.modelId ?? (await getActiveModel());
  if (!modelId) return null;

  const modelPath = path.join(modelsDir(), `${modelId}.gguf`);
  if (!(await exists(modelPath))) return null; // downloaded via Ollama/sideload, or not yet

  // Vision model? Serve with its projector so it can read images.
  const projector = mmprojPath(modelId);
  const hasVision = await exists(projector);

  const ensure = opts.ensureRuntime ?? realEnsureRuntime;
  const start = opts.startServer ?? realStartServer;

  opts.onProgress?.("Preparing the local runtime…");
  const binPath = await ensure({ onProgress: (p) => opts.onProgress?.(p.message) });

  opts.onProgress?.(`Starting ${modelId}…`);
  // Use a fresh free port each time so swapping models doesn't clash with the
  // previous llama-server still releasing its port.
  const port = opts.port ?? (await getFreePort());
  const server: RunningServer = await start({
    binPath,
    modelPath,
    port,
    ...(hasVision ? { mmprojPath: projector } : {}),
  });

  return { url: server.url, modelId, stop: server.stop };
}
