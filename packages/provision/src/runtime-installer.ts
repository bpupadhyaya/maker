import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { makerHomeDir } from "./models-store.ts";

/**
 * Turnkey runtime (H6.1) — the app fetches a portable **llama.cpp** build so that
 * after the user downloads a model, there is NOTHING else to install: Maker runs
 * the model itself. The runtime lives in the app space (`~/.maker/runtime`), like
 * the models. This module fetches + checksum-verifies + unpacks + marks the
 * `llama-server` binary executable.
 *
 * Real per-platform release URLs + sha256 are pinned per llama.cpp release
 * (needs-user to fill for each OS/arch); the fetch/verify/unpack/chmod infra here
 * is real and offline-after-first-download. Fetch is injectable for tests.
 */
export interface RuntimeBuild {
  /** e.g. "darwin-arm64". */
  readonly platform: string;
  /** Substring identifying this platform's asset in a llama.cpp release. */
  readonly assetMatch: string;
  /** Optional explicit URL (override/testing); default resolves dynamically. */
  readonly url?: string;
  /** Pinned sha256 of the download (undefined → trust-on-first-use). */
  readonly sha256?: string;
  /** Path of the server binary inside the unpacked archive (relative). */
  readonly serverBin: string;
}

/** llama.cpp's official releases (the source of the portable runtime). */
export const RUNTIME_RELEASE_API =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";

/**
 * Per-platform portable llama.cpp builds — matched to a real asset in the latest
 * llama.cpp release (asset names look like `llama-b<NNNN>-bin-macos-arm64.zip`).
 * The exact build number changes each release, so we resolve the current asset
 * dynamically via the releases API instead of pinning a URL that rots.
 */
export const RUNTIME_CATALOG: readonly RuntimeBuild[] = [
  { platform: "darwin-arm64", assetMatch: "macos-arm64", serverBin: "llama-server" },
  { platform: "darwin-x64", assetMatch: "macos-x64", serverBin: "llama-server" },
  { platform: "linux-x64", assetMatch: "ubuntu-x64", serverBin: "llama-server" },
  { platform: "win-x64", assetMatch: "win-cpu-x64", serverBin: "llama-server.exe" },
];

export function platformKey(
  p: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const os = p === "darwin" ? "darwin" : p === "win32" ? "win" : "linux";
  const a = arch === "arm64" ? "arm64" : "x64";
  return `${os}-${a}`;
}

export function runtimeDir(): string {
  return path.join(makerHomeDir(), "runtime");
}

export function buildForPlatform(key: string = platformKey()): RuntimeBuild | undefined {
  return RUNTIME_CATALOG.find((b) => b.platform === key);
}

/** Absolute path to the installed llama-server binary (whether or not it exists). */
export function serverBinPath(build: RuntimeBuild): string {
  return path.join(runtimeDir(), build.serverBin);
}

/** A user-provided runtime (MAKER_RUNTIME=/path/to/llama-server) always wins. */
export function runtimeOverride(): string | undefined {
  return process.env["MAKER_RUNTIME"];
}

/** Is a usable llama-server already available (override or fetched)? */
export async function detectRuntime(): Promise<string | undefined> {
  const override = runtimeOverride();
  if (override) return override;
  const build = buildForPlatform();
  if (!build) return undefined;
  const bin = serverBinPath(build);
  try {
    await fs.access(bin);
    return bin;
  } catch {
    return undefined;
  }
}

export interface RuntimeProgress {
  readonly message: string;
  readonly ratio?: number;
}

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json?(): Promise<unknown>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;

/** Resolve the current download URL for a platform's asset via the releases API. */
export async function resolveRuntimeUrl(
  build: RuntimeBuild,
  doFetch: FetchLike,
): Promise<string> {
  if (build.url) return build.url;
  const res = await doFetch(RUNTIME_RELEASE_API);
  if (!res.ok || !res.json) {
    throw new Error(`llama.cpp release lookup failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { assets?: { name?: string; browser_download_url?: string }[] };
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const asset = assets.find(
    (a) => typeof a.name === "string" && a.name.includes(build.assetMatch) && a.name.endsWith(".zip"),
  );
  if (!asset?.browser_download_url) {
    throw new Error(`No llama.cpp asset matching "${build.assetMatch}" in the latest release.`);
  }
  return asset.browser_download_url;
}

export interface EnsureRuntimeOptions {
  readonly onProgress?: (p: RuntimeProgress) => void;
  readonly fetch?: FetchLike;
  /** Injectable unpack for tests; default writes the payload as the server binary. */
  readonly unpack?: (payload: Buffer, destDir: string, build: RuntimeBuild) => Promise<void>;
}

/** Run a command to completion; reject on non-zero exit. */
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${String(code)}`)),
    );
  });
}

/** Recursively find a file named `name` under `dir` (archives nest the binary). */
export async function findServerBinary(
  dir: string,
  name: string,
): Promise<string | undefined> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory()) {
      const found = await findServerBinary(full, name);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Unpack the downloaded llama.cpp archive with the OS's own extractor (no bundled
 * unzip), locate the server binary (it's typically nested, e.g. build/bin/), and
 * place it at <runtime>/<serverBin>. Injectable via EnsureRuntimeOptions.unpack.
 */
async function defaultUnpack(payload: Buffer, destDir: string, build: RuntimeBuild): Promise<void> {
  const zipPath = path.join(destDir, "runtime-download.zip");
  const extractDir = path.join(destDir, "unpack");
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await fs.writeFile(zipPath, payload);

  if (process.platform === "win32") {
    await run("powershell", [
      "-NoProfile", "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`,
    ]);
  } else if (process.platform === "darwin") {
    await run("ditto", ["-x", "-k", zipPath, extractDir]);
  } else {
    await run("unzip", ["-o", "-q", zipPath, "-d", extractDir]);
  }
  await fs.rm(zipPath, { force: true });

  const found = await findServerBinary(extractDir, build.serverBin);
  if (!found) throw new Error(`${build.serverBin} not found inside the runtime archive.`);
  const target = path.join(destDir, build.serverBin);
  if (found !== target) await fs.copyFile(found, target);
}

/**
 * Ensure a llama.cpp runtime is present, fetching it if needed. No-ops when one
 * already exists (override or previously fetched) — so it's safe to call on every
 * launch. Returns the server binary path, or throws with a clear, honest error
 * when the platform build isn't pinned yet or the fetch fails offline.
 */
export async function ensureRuntime(opts: EnsureRuntimeOptions = {}): Promise<string> {
  const existing = await detectRuntime();
  if (existing) return existing;

  const build = buildForPlatform();
  if (!build) {
    throw new Error(
      `No portable runtime for ${platformKey()} yet. You can still use Ollama or sideload a .gguf, or set MAKER_RUNTIME=/path/to/llama-server.`,
    );
  }

  const doFetch: FetchLike = opts.fetch ?? ((u) => fetch(u) as unknown as ReturnType<FetchLike>);
  const unpack = opts.unpack ?? defaultUnpack;
  const dir = runtimeDir();
  await fs.mkdir(dir, { recursive: true });

  opts.onProgress?.({ message: `Finding the latest llama.cpp runtime for ${build.platform}…` });
  let downloadUrl: string;
  try {
    downloadUrl = await resolveRuntimeUrl(build, doFetch);
  } catch (e) {
    throw new Error(
      `Couldn't find the runtime download (offline?). Sideload a .gguf or use Ollama meanwhile. (${String(e)})`,
    );
  }

  opts.onProgress?.({ message: "Downloading the runtime (one-time)…" });
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(downloadUrl);
  } catch (e) {
    throw new Error(`Couldn't download the runtime (offline?). (${String(e)})`);
  }
  if (!res.ok || !res.arrayBuffer) throw new Error(`Runtime download failed: HTTP ${res.status}`);

  const payload = Buffer.from(await res.arrayBuffer());
  if (build.sha256) {
    const digest = createHash("sha256").update(payload).digest("hex");
    if (digest.toLowerCase() !== build.sha256.toLowerCase()) {
      throw new Error("Runtime checksum mismatch — refusing to install.");
    }
  }

  opts.onProgress?.({ message: "Unpacking runtime…", ratio: 0.9 });
  await unpack(payload, dir, build);
  const bin = serverBinPath(build);
  try {
    await fs.chmod(bin, 0o755);
  } catch {
    // best-effort (Windows / already-executable)
  }
  opts.onProgress?.({ message: "Runtime ready.", ratio: 1 });
  return bin;
}
