import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolRuntime } from "../../engine/src/index.ts";
import { modelsDir, getActiveModel, listInstalledModels } from "./models-store.ts";
import { detectRuntime, runtimeOverride } from "./runtime-installer.ts";

export interface GateResult {
  readonly passed: boolean;
  readonly detail: string;
  /** Provisioning readiness (H7.4) — is a model + a runtime actually present? */
  readonly provisioned?: ProvisionCheck;
}

export interface ProvisionCheck {
  readonly model: boolean;
  readonly runtime: boolean;
  readonly ready: boolean;
  readonly detail: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is Maker actually provisioned to run a model offline (H7.4)? Ready when there's
 * BOTH an active model (a downloaded GGUF, or Ollama) AND a runtime to run it
 * (fetched llama.cpp, a MAKER_RUNTIME override, or Ollama).
 */
export async function checkProvisioned(): Promise<ProvisionCheck> {
  const usingOllama = process.env["MAKER_BACKEND"] === "ollama";

  const activeId = await getActiveModel();
  const ggufPresent = activeId ? await fileExists(path.join(modelsDir(), `${activeId}.gguf`)) : false;
  const anyInstalled = (await listInstalledModels()).length > 0;
  const model = usingOllama || ggufPresent || anyInstalled;

  const runtime = usingOllama || Boolean(runtimeOverride()) || Boolean(await detectRuntime());

  const ready = model && runtime;
  const detail = ready
    ? "model + runtime present — offline-ready"
    : `${model ? "" : "no model; "}${runtime ? "" : "no runtime; "}run /setup (or set MAKER_RUNTIME / use Ollama / sideload)`.trim();
  return { model, runtime, ready, detail };
}

/**
 * The offline gate (DESIGN.md -> the "trust moment"): with no network, build and
 * run a trivial tool end to end and confirm it serves. Passing is the explicit
 * promise — "you are now 100% offline-capable." This is "always-runnable" applied
 * to the install itself, and it runs as a CI release gate per OS.
 */
export async function runOfflineGate(runtime: ToolRuntime): Promise<GateResult> {
  const marker = "maker-offline-ok";
  try {
    const built = await runtime.build({
      id: "__offline_gate__",
      files: {
        "index.html": `<!doctype html><span id="m">${marker}</span>`,
      },
    });
    const running = await runtime.run(built);
    try {
      const res = await fetch(running.url);
      const text = await res.text();
      const served = res.status === 200 && text.includes(marker);
      const provisioned = await checkProvisioned();
      const passed = served && provisioned.ready;
      return {
        passed,
        provisioned,
        detail: !served
          ? `unexpected response (status ${res.status})`
          : provisioned.ready
            ? "built and served a tool with no network; model + runtime present"
            : `builds offline, but not provisioned yet — ${provisioned.detail}`,
      };
    } finally {
      await running.stop();
    }
  } catch (err) {
    return {
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
