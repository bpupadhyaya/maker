import { spawn as nodeSpawn } from "node:child_process";
import { createServer } from "node:net";

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
  kill(signal?: string): void;
  on(event: "exit" | "error", listener: (arg?: unknown) => void): void;
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
  readonly spawn?: SpawnLike;
  readonly fetch?: FetchLike;
  /** Injectable delay (ms → Promise) so smokes don't wait on the clock. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RunningServer {
  readonly url: string;
  readonly port: number;
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
  const child = doSpawn(opts.binPath, args);

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
      if (res.ok) return { url, port, stop };
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
