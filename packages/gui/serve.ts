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
import {
  fileMemoryStore, tasteMemory, toolRegistry, getRoles, setRoles, isOnboarded,
  listProjects, createProject, getActiveProject, setActiveProject, addToolToProject,
  setMacro, removeMacro, listMacros, resolveMacro,
  addSchedule, listSchedules, removeSchedule, cronLineFor, startScheduleRunner,
  addHook, listHooks, removeHook, runHooks,
  recordPrompt, historyOverview, searchHistory,
  getSettings, setSetting,
  recordSession, recordToolBuilt, recordTokens, getStats,
} from "../store/src/index.ts";
import type { Settings } from "../store/src/index.ts";
import type { HookEvent } from "../store/src/index.ts";
import { ROLES, startersForRoles, orderedStarters } from "../engine/src/index.ts";
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
    onToolBuilt: async (toolId) => {
      const p = await getActiveProject(store);
      await addToolToProject(store, p.id, toolId);
      await runHooks(store, "tool-built", { toolId });
      await recordToolBuilt(store);
    },
  });
  await maker.restore();
  await recordSession(store);
  const scheduleRunner = startScheduleRunner(maker, store);

  const server = http.createServer((req, res) => {
    void handle(req, res, maker, store).catch((err: unknown) => {
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
        scheduleRunner.stop();
        void maker.stop().finally(() => server.close(() => resolve()));
      }),
  };
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maker: Maker,
  store: ReturnType<typeof fileMemoryStore>,
): Promise<void> {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  const method = req.method ?? "GET";

  // --- profile / role onboarding (H5.1) ---
  if (url === "/api/profile" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        roles: await getRoles(store),
        onboarded: await isOnboarded(store),
        availableRoles: ROLES.map((r) => ({ id: r.id, label: r.label, blurb: r.blurb })),
      }),
    );
    return;
  }
  if (url === "/api/profile/roles" && method === "POST") {
    const body = await readJson(req);
    const roles = Array.isArray(body["roles"]) ? body["roles"].map(String) : [];
    await setRoles(store, roles);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ roles }));
    return;
  }
  if (url === "/api/starters" && method === "GET") {
    const roles = await getRoles(store);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ starters: orderedStarters(startersForRoles(roles)) }));
    return;
  }
  if (url === "/api/projects" && method === "GET") {
    const active = (await getActiveProject(store)).id; // ensures the default exists
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ projects: await listProjects(store), active }));
    return;
  }
  if (url === "/api/projects" && method === "POST") {
    const body = await readJson(req);
    const project = await createProject(store, String(body["name"] ?? "Project"));
    await setActiveProject(store, project.id);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(project));
    return;
  }
  if (url === "/api/projects/use" && method === "POST") {
    const body = await readJson(req);
    await setActiveProject(store, String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ active: String(body["id"]) }));
    return;
  }

  // --- macros (H5.4) ---
  if (url === "/api/macros" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ macros: await listMacros(store) }));
    return;
  }
  if (url === "/api/macros" && method === "POST") {
    const body = await readJson(req);
    await setMacro(store, String(body["name"]), String(body["prompt"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url === "/api/macros/remove" && method === "POST") {
    const body = await readJson(req);
    const removed = await removeMacro(store, String(body["name"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ removed }));
    return;
  }

  // --- schedules (H5.5) ---
  if (url === "/api/schedules" && method === "GET") {
    const schedules = await listSchedules(store);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ schedules: schedules.map((s) => ({ ...s, cron: cronLineFor(s) })) }));
    return;
  }
  if (url === "/api/schedules" && method === "POST") {
    const body = await readJson(req);
    const s = await addSchedule(store, {
      prompt: String(body["prompt"] ?? ""),
      everyMinutes: Number(body["everyMinutes"] ?? 60),
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(s));
    return;
  }
  if (url === "/api/schedules/remove" && method === "POST") {
    const body = await readJson(req);
    const removed = await removeSchedule(store, String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ removed }));
    return;
  }

  // --- hooks (H5.6) ---
  if (url === "/api/hooks" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ hooks: await listHooks(store) }));
    return;
  }
  if (url === "/api/hooks" && method === "POST") {
    const body = await readJson(req);
    const h = await addHook(store, String(body["event"]) as HookEvent, String(body["command"] ?? ""));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(h));
    return;
  }
  if (url === "/api/hooks/remove" && method === "POST") {
    const body = await readJson(req);
    const removed = await removeHook(store, String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ removed }));
    return;
  }

  // --- usage stats (H5.9) ---
  if (url === "/api/stats" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(await getStats(store)));
    return;
  }

  // --- settings (H5.8) ---
  if (url === "/api/settings" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(await getSettings(store)));
    return;
  }
  if (url === "/api/settings" && method === "POST") {
    const body = await readJson(req);
    const key = String(body["key"]) as keyof Settings;
    const value = String(body["value"]);
    const next = await setSetting(store, key, value);
    if (key === "model" && value) await setActiveModel(value);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(next));
    return;
  }

  // --- history + search (H5.7) ---
  if (url === "/api/history" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(await historyOverview(store)));
    return;
  }
  if (url === "/api/search" && method === "GET") {
    const q = new URL(req.url ?? "/", "http://localhost").searchParams.get("q") ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ hits: await searchHistory(store, q) }));
    return;
  }

  // --- conversation bridge (SSE) ---
  if (url === "/api/express" && method === "POST") {
    const body = await readJson(req);
    let request = String(body["request"] ?? "");
    // Macro expansion: a typed /name maps to a saved prompt.
    if (request.startsWith("/")) {
      const macro = await resolveMacro(store, request.slice(1).split(/\s+/)[0] ?? "");
      if (macro !== undefined) request = macro;
    }
    await recordPrompt(store, request);
    await recordTokens(store, Math.ceil(request.length / 4));
    sse(res);
    try {
      for await (const ev of maker.express(request)) {
        if (ev.type === "tool-running") void runHooks(store, "tool-running", { url: ev.url });
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
