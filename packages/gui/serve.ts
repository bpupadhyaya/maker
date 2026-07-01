import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  createMaker,
  echoInference,
  ollamaInference,
  llamaCppInference,
  mlxInference,
} from "../engine/src/index.ts";
import type { InferenceBackend, Maker } from "../engine/src/index.ts";
import { localWebRuntime } from "../runtime/src/index.ts";
import { fileMemoryStore, tasteMemory, toolRegistry } from "../store/src/index.ts";
import {
  detectHardware,
  selectModel,
  MODEL_CATALOG,
  chooseInstaller,
  listInstalledModels,
  modelDiskUsage,
  removeModel,
  removeAllModels,
  resetMakerData,
  getActiveModel,
  setActiveModel,
} from "../provision/src/index.ts";

/**
 * The GUI, runnable today with NO Rust/Tauri: a tiny Node server that serves the
 * web UI, bridges the conversation to the engine over SSE, and exposes model
 * management as REST. Tauri (G5) is just native packaging on top of this.
 */
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function makeInference(name: string): InferenceBackend {
  switch (name) {
    case "ollama":
      return ollamaInference();
    case "llamacpp":
    case "llama.cpp":
      return llamaCppInference();
    case "mlx":
      return mlxInference();
    default:
      return echoInference();
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort; the URL is printed anyway
  }
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sse(res: http.ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

async function modelsPayload(): Promise<unknown> {
  const hw = detectHardware();
  return {
    installed: await listInstalledModels(),
    active: (await getActiveModel()) ?? null,
    recommended: selectModel(hw).id,
    diskUsageBytes: await modelDiskUsage(),
    available: MODEL_CATALOG.map((m) => ({
      id: m.id,
      name: m.name,
      tier: m.tier,
      minMemGB: m.minMemGB,
      approxSizeGB: m.approxSizeGB,
      license: m.license,
      recommended: Boolean(m.recommended),
      ollama: m.ollama ?? null,
      hasGguf: Boolean(m.gguf),
      hasMlx: Boolean(m.mlx),
    })),
  };
}

async function serveStatic(res: http.ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const target = path.resolve(WEB_DIR, rel);
  if (target !== path.resolve(WEB_DIR) && !target.startsWith(path.resolve(WEB_DIR) + path.sep)) {
    res.statusCode = 403;
    res.end("403");
    return;
  }
  try {
    const data = await fs.readFile(target);
    res.setHeader("content-type", CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("404");
  }
}

export interface ServeOptions {
  readonly port?: number;
  readonly open?: boolean;
}

export async function startServer(
  opts: ServeOptions = {},
): Promise<{ url: string; close: () => Promise<void> }> {
  const backendName = process.env["MAKER_BACKEND"] ?? "echo";
  const store = fileMemoryStore();
  const maker: Maker = createMaker({
    inference: makeInference(backendName),
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
    registry: toolRegistry(store),
  });
  await maker.restore();

  const server = http.createServer((req, res) => {
    void handle(req, res, maker).catch((err: unknown) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });

  const port = opts.port ?? Number(process.env["MAKER_GUI_PORT"] ?? 4319);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr !== null ? addr.port : port;
  const url = `http://127.0.0.1:${actualPort}/`;

  if (opts.open !== false) openBrowser(url);

  return {
    url,
    close: () =>
      new Promise<void>((resolve) => {
        void maker.stop().finally(() => server.close(() => resolve()));
      }),
  };
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maker: Maker,
): Promise<void> {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  const method = req.method ?? "GET";

  // --- conversation bridge (SSE) ---
  if (url === "/api/express" && method === "POST") {
    const body = await readJson(req);
    sse(res);
    try {
      for await (const ev of maker.express(String(body["request"] ?? ""))) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`);
    }
    res.write("event: done\ndata: {}\n\n");
    res.end();
    return;
  }

  // --- model management ---
  if (url === "/api/models" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(await modelsPayload()));
    return;
  }
  if (url === "/api/models/use" && method === "POST") {
    const body = await readJson(req);
    await setActiveModel(String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ active: String(body["id"]) }));
    return;
  }
  if (url === "/api/models/remove" && method === "POST") {
    const body = await readJson(req);
    const removed = await removeModel(String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ removed }));
    return;
  }
  if (url === "/api/models/remove-all" && method === "POST") {
    const result = await removeAllModels();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result));
    return;
  }
  if (url === "/api/reset" && method === "POST") {
    const result = await resetMakerData();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result));
    return;
  }
  if (url === "/api/models/download" && method === "POST") {
    const body = await readJson(req);
    const id = String(body["id"]);
    const entry = MODEL_CATALOG.find((m) => m.id === id);
    sse(res);
    if (!entry) {
      res.write(`data: ${JSON.stringify({ error: `unknown model ${id}` })}\n\n`);
      res.end();
      return;
    }
    const { installer } = chooseInstaller();
    try {
      await installer.install(entry, (ratio, note) =>
        res.write(`data: ${JSON.stringify({ ratio, note })}\n\n`),
      );
      await setActiveModel(id);
      res.write(`data: ${JSON.stringify({ done: true, id })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
    }
    res.end();
    return;
  }

  // --- static web UI ---
  if (method === "GET") {
    await serveStatic(res, url);
    return;
  }
  res.statusCode = 404;
  res.end("404");
}

export async function main(): Promise<void> {
  const { url } = await startServer({});
  process.stdout.write(`Maker GUI running → ${url}\n(Backend: ${process.env["MAKER_BACKEND"] ?? "echo"}. Ctrl+C to stop.)\n`);
}

const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
