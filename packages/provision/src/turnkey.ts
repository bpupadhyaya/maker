import * as fs from "node:fs/promises";
import * as path from "node:path";
import { modelsDir, getActiveModel } from "./models-store.ts";
import { ensureRuntime as realEnsureRuntime } from "./runtime-installer.ts";
import { startLlamaServer as realStartServer } from "./server-manager.ts";
import type { RunningServer } from "./server-manager.ts";

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

export async function startModelRuntime(
  opts: StartModelRuntimeOptions = {},
): Promise<ModelRuntime | null> {
  // Ollama manages its own server — not our job to run llama-server.
  if (process.env["MAKER_BACKEND"] === "ollama") return null;

  const modelId = await getActiveModel();
  if (!modelId) return null;

  const modelPath = path.join(modelsDir(), `${modelId}.gguf`);
  if (!(await exists(modelPath))) return null; // downloaded via Ollama/sideload, or not yet

  const ensure = opts.ensureRuntime ?? realEnsureRuntime;
  const start = opts.startServer ?? realStartServer;

  opts.onProgress?.("Preparing the local runtime…");
  const binPath = await ensure({ onProgress: (p) => opts.onProgress?.(p.message) });

  opts.onProgress?.(`Starting ${modelId}…`);
  const server: RunningServer = await start({
    binPath,
    modelPath,
    ...(opts.port !== undefined ? { port: opts.port } : {}),
  });

  return { url: server.url, modelId, stop: server.stop };
}
