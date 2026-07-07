import { spawn as nodeSpawn } from "node:child_process";
import { createServer } from "node:net";
import * as os from "node:os";

/**
 * Reap llama-server processes left over from a PREVIOUS Maker run that was
 * force-quit or crashed. On macOS/Linux a child isn't killed when its parent
 * dies, so a hard exit orphans llama-server and they accumulate across launches,
 * silently eating memory. Call this ONCE at startup — before we spawn any model
 * server, every running one is an orphan of a prior instance, so it's safe to
 * kill them all. Best-effort + non-blocking; matches only OUR runtime path.
 */
export function reapOrphanModelServers(): void {
  try {
    if (process.platform === "win32") {
      nodeSpawn("taskkill", ["/F", "/IM", "llama-server.exe"], { stdio: "ignore" }).on("error", () => {});
    } else {
      // Match processes whose command line references our runtime dir, so we
      // never touch an unrelated llama-server the user might run themselves.
      nodeSpawn("pkill", ["-f", ".maker/runtime.*llama-server"], { stdio: "ignore" }).on("error", () => {});
    }
  } catch { /* best-effort */ }
}

/** Ask the OS for a free localhost port (avoids clashes when swapping models). */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Server lifecycle manager (H6.2) — spawns and supervises `llama-server` pointed
 * at the downloaded GGUF, so the app runs the model itself (turnkey). Polls
 * /health until the server is ready, then the llama.cpp backend talks to it over
 * HTTP. spawn + fetch are injectable so this smokes with a fake server (no real
 * binary/network).
 */

/** Minimal child-process shape we depend on (real ChildProcess satisfies it). */
export interface ServerChild {
  readonly pid?: number;
  kill(signal?: string): void;
  on(event: "exit" | "error", listener: (arg?: unknown) => void): void;
}

/**
 * Memory-safe llama-server settings. CRITICAL: without these, llama-server runs
 * with an uncapped context window and an f16 KV cache, so a single model can
 * balloon to many GB (and full Metal offload of a model that doesn't comfortably
 * fit will pin the whole thing resident in unified memory → OOM). Computed from
 * the CURRENT free RAM + the model's on-disk size. Applies to free Maker and Pro.
 */
export interface ServerTuning {
  ctxSize: number;
  cacheType: "f16" | "q8_0";
  gpuLayers: number; // llama.cpp -ngl; 999 = full offload, 0 = CPU
  threads: number;
}

export function computeServerTuning(modelSizeGB: number): ServerTuning {
  const totalGB = os.totalmem() / 1024 ** 3;
  const freeGB = os.freemem() / 1024 ** 3;
  const RESERVE_GB = 3; // leave room for the app, webview, and OS
  // How much RAM is realistically available for THIS model's runtime beyond its
  // own weights, right now — the tighter of "free now" and "total minus weights".
  const headroomGB = Math.max(0, Math.min(freeGB, totalGB - modelSizeGB) - RESERVE_GB);

  // Context window drives KV-cache size; size it to the headroom.
  let ctxSize: number;
  if (headroomGB >= 12) ctxSize = 16384;
  else if (headroomGB >= 6) ctxSize = 8192;
  else if (headroomGB >= 3) ctxSize = 4096;
  else ctxSize = 2048;

  // Quantize the KV cache whenever memory is even moderately constrained (halves it).
  const cacheType: ServerTuning["cacheType"] = headroomGB < 10 ? "q8_0" : "f16";

  // GPU offload (Apple Silicon unified memory): FULL offload pins the model
  // resident, so only do it when weights + a little KV clearly fit under total
  // memory minus the reserve. Otherwise stay on CPU (mmap-paged) to avoid OOM.
  const appleSilicon = process.arch === "arm64" && os.platform() === "darwin";
  const fitsForOffload = modelSizeGB + 2 <= totalGB - RESERVE_GB;
  const gpuLayers = appleSilicon && fitsForOffload ? 999 : 0;

  const threads = Math.max(2, Math.min(os.cpus().length - 2, 12));
  return { ctxSize, cacheType, gpuLayers, threads };
}

/** True when the model's weights alone won't fit in this machine's RAM safely. */
export function modelFitsInRam(modelSizeGB: number): boolean {
  const totalGB = os.totalmem() / 1024 ** 3;
  return modelSizeGB + 2 <= totalGB; // weights + minimal overhead under total RAM
}

type SpawnLike = (bin: string, args: string[]) => ServerChild;
type FetchLike = (url: string) => Promise<{ ok: boolean; status: number }>;

export interface StartServerOptions {
  readonly binPath: string;
  readonly modelPath: string;
  /** Vision projector (mmproj) path — enables image input when set. */
  readonly mmprojPath?: string;
  readonly port?: number;
  readonly host?: string;
  /** Overall time to wait for /health to go green. */
  readonly timeoutMs?: number;
  /** Poll interval while waiting. */
  readonly pollMs?: number;
  /** Memory-safe runtime settings (ctx window, KV-cache type, GPU offload, threads). */
  readonly tuning?: ServerTuning;
  readonly spawn?: SpawnLike;
  readonly fetch?: FetchLike;
  /** Injectable delay (ms → Promise) so smokes don't wait on the clock. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RunningServer {
  readonly url: string;
  readonly port: number;
  /** OS pid of the llama-server process (for memory accounting / targeted stop). */
  readonly pid?: number;
  stop(): void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Start llama-server and resolve once /health is ready. Rejects (and kills the
 * child) with a clear message on timeout or spawn error.
 */
export async function startLlamaServer(
  opts: StartServerOptions,
): Promise<RunningServer> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 8080;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const pollMs = opts.pollMs ?? 300;
  const sleep = opts.sleep ?? defaultSleep;
  const doSpawn: SpawnLike =
    opts.spawn ?? ((bin, args) => nodeSpawn(bin, args, { stdio: "ignore" }) as unknown as ServerChild);
  const doFetch: FetchLike = opts.fetch ?? ((u) => fetch(u) as unknown as ReturnType<FetchLike>);

  const url = `http://${host}:${port}`;
  const args = ["-m", opts.modelPath, "--host", host, "--port", String(port)];
  // Vision models need their projector to see images.
  if (opts.mmprojPath) args.push("--mmproj", opts.mmprojPath);
  // Memory-safety: cap the context window, quantize the KV cache, bound GPU
  // offload + threads. Without these llama-server runs uncapped and a single
  // model can consume many GB more than its weights.
  const t = opts.tuning;
  if (t) {
    args.push("--ctx-size", String(t.ctxSize));
    if (t.cacheType === "q8_0") args.push("--cache-type-k", "q8_0", "--cache-type-v", "q8_0");
    args.push("-ngl", String(t.gpuLayers), "-t", String(t.threads));
  }
  const child = doSpawn(opts.binPath, args);
  const pid = child.pid;

  let exited = false;
  let exitInfo = "";
  child.on("exit", (code) => {
    exited = true;
    exitInfo = `llama-server exited (code ${String(code)})`;
  });
  child.on("error", (err) => {
    exited = true;
    exitInfo = `failed to start llama-server: ${String(err)}`;
  });

  const stop = (): void => {
    try {
      child.kill();
    } catch {
      // best-effort
    }
  };

  const deadline = timeoutMs;
  let waited = 0;
  while (waited < deadline) {
    if (exited) {
      stop();
      throw new Error(exitInfo || "llama-server exited before becoming ready");
    }
    try {
      const res = await doFetch(`${url}/health`);
      if (res.ok) return { url, port, ...(pid !== undefined ? { pid } : {}), stop };
    } catch {
      // server not up yet — keep polling
    }
    await sleep(pollMs);
    waited += pollMs;
  }
  stop();
  throw new Error(
    `llama-server did not become ready within ${timeoutMs}ms at ${url}. Try a smaller model, or set MAKER_RUNTIME to a working llama-server.`,
  );
}
