import type { Hardware } from "./hardware.ts";
import { detectHardware } from "./hardware.ts";
import type { ModelEntry } from "./catalog.ts";
import { selectModel } from "./catalog.ts";

/**
 * Guided first-run provisioning (DESIGN.md -> "guided one-tap, not a chore").
 * The user triggers setup once; the app does everything — detect hardware, pick
 * the tier-matched model, download + verify it, with progress. No shell commands,
 * no HuggingFace, no `ollama pull` typed by the user. After this, fully offline.
 */

export interface ProvisionProgress {
  readonly phase: "select" | "install" | "verify" | "done" | "error";
  readonly message: string;
  /** 0..1 during download, when known. */
  readonly ratio?: number;
}

export type ProgressFn = (p: ProvisionProgress) => void;

/**
 * Fetches a model on the app's behalf. Concrete impls: an Ollama-pull installer,
 * a direct GGUF downloader (bundled llama.cpp), or a sideload installer that
 * copies a local file. Injectable so the flow is testable without a network.
 */
export interface ModelInstaller {
  readonly name: string;
  isInstalled(entry: ModelEntry): Promise<boolean>;
  install(
    entry: ModelEntry,
    onProgress?: (ratio: number, note: string) => void,
  ): Promise<void>;
}

export interface ProvisionResult {
  readonly model: ModelEntry;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ProvisionOptions {
  readonly installer: ModelInstaller;
  readonly hardware?: Hardware;
  readonly catalog?: readonly ModelEntry[];
  readonly onProgress?: ProgressFn;
}

export async function provisionModel(
  opts: ProvisionOptions,
): Promise<ProvisionResult> {
  const report: ProgressFn = opts.onProgress ?? (() => {});
  const hw = opts.hardware ?? detectHardware();
  const model = selectModel(hw, opts.catalog);

  report({
    phase: "select",
    message: `Picked ${model.name} for your ${hw.tier} machine (${hw.totalMemGB}GB RAM).`,
  });

  if (await opts.installer.isInstalled(model)) {
    report({ phase: "done", message: `${model.name} is already installed.` });
    return { model, ok: true, detail: "already installed" };
  }

  try {
    report({
      phase: "install",
      message: `Downloading ${model.name} (~${model.approxSizeGB}GB). This is the only step that needs internet.`,
      ratio: 0,
    });
    await opts.installer.install(model, (ratio, note) =>
      report({ phase: "install", message: note, ratio }),
    );
    report({
      phase: "done",
      message: `${model.name} is ready — you're now 100% offline-capable.`,
    });
    return { model, ok: true, detail: "installed" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    report({ phase: "error", message: `Setup couldn't finish: ${detail}` });
    return { model, ok: false, detail };
  }
}
