import type { ModelInstaller } from "./provisioner.ts";
import type { Hardware } from "./hardware.ts";
import { ggufInstaller } from "./gguf-installer.ts";
import { ollamaInstaller } from "./ollama-installer.ts";
import { sideloadInstaller } from "./sideload-installer.ts";

/**
 * Backend/installer chooser (DESIGN.md -> "per-device backends" + "sideload
 * fallback"). Auto-selects how the model is fetched and which runtime runs it,
 * by platform + availability + preference — so `/setup` just works.
 */
export type InstallerKind = "gguf" | "ollama" | "sideload";
export type BackendKind = "mlx" | "llama.cpp" | "ollama";

export interface ChooseInstallerOptions {
  readonly prefer?: InstallerKind;
  /** A local .gguf to sideload (wins over everything — low-connectivity path). */
  readonly sideloadPath?: string;
  readonly dir?: string;
  readonly fetch?: (url: string) => Promise<Response>;
}

export function chooseInstaller(opts: ChooseInstallerOptions = {}): {
  readonly kind: InstallerKind;
  readonly installer: ModelInstaller;
} {
  if (opts.sideloadPath) {
    const sideloadOpts = opts.dir !== undefined ? { dir: opts.dir } : {};
    return { kind: "sideload", installer: sideloadInstaller(opts.sideloadPath, sideloadOpts) };
  }
  if (opts.prefer === "ollama") {
    return { kind: "ollama", installer: ollamaInstaller() };
  }
  // Default: GGUF (llama.cpp path) — needs only the network, no external runtime.
  const ggufOpts: { dir?: string; fetch?: (u: string) => Promise<Response> } = {};
  if (opts.dir !== undefined) ggufOpts.dir = opts.dir;
  if (opts.fetch !== undefined) ggufOpts.fetch = opts.fetch;
  return { kind: "gguf", installer: ggufInstaller(ggufOpts) };
}

export interface ChooseBackendOptions {
  readonly prefer?: BackendKind;
  readonly appleSilicon?: boolean;
}

/** Which inference runtime to use: MLX on Apple Silicon, else llama.cpp. */
export function chooseBackendKind(
  hw: Hardware,
  opts: ChooseBackendOptions = {},
): BackendKind {
  if (opts.prefer) return opts.prefer;
  const apple = opts.appleSilicon ?? (hw.platform === "darwin" && hw.arch === "arm64");
  return apple ? "mlx" : "llama.cpp";
}
