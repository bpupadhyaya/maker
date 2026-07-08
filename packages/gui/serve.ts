import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createMaker,
  echoInference,
  ollamaInference,
  llamaCppInference,
  mlxInference,
  cloudInference,
} from "../engine/src/index.ts";
import type { InferenceBackend, Maker } from "../engine/src/index.ts";
import { localWebRuntime } from "../runtime/src/index.ts";
import {
  fileMemoryStore, tasteMemory, toolRegistry, getRoles, setRoles, isOnboarded,
  listProjects, createProject, getActiveProject, setActiveProject, addToolToProject,
  setMacro, removeMacro, listMacros, resolveMacro,
  grantPath, isGranted, listGrantedPaths, revokePath,
  addSchedule, listSchedules, removeSchedule, cronLineFor, startScheduleRunner,
  addHook, listHooks, removeHook, runHooks, startWatcher,
  recordPrompt, historyOverview, searchHistory,
  getSettings, setSetting, generationParams,
  recordSession, recordToolBuilt, recordTokens, getStats,
  listProviders, getEscalationMode, setEscalationMode, addProvider, removeProvider, activeProvider, redact,
} from "../store/src/index.ts";
import type { Settings } from "../store/src/index.ts";
import type { HookEvent } from "../store/src/index.ts";
import { ROLES, startersForRoles, orderedStarters } from "../engine/src/index.ts";
import { runDoctor, formatDoctor } from "../tui/src/doctor.ts";
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
  startModelRuntime,
  reapOrphanModelServers,
  ensureRuntime,
  shouldFetchRuntime,
  mmprojPath,
  classifyTask,
  routeModel,
  gaugeComplexity,
  shouldEscalate,
  hasWhisperModel,
} from "../provision/src/index.ts";

/**
 * The GUI, runnable today with NO Rust/Tauri: a tiny Node server that serves the
 * web UI, bridges the conversation to the engine over SSE, and exposes model
 * management as REST. Tauri (G5) is just native packaging on top of this.
 */
// Packaged builds set MAKER_WEB_DIR to the bundled web assets (next to the
// sidecar binary); from source it resolves relative to this file.
const WEB_DIR = process.env["MAKER_WEB_DIR"] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "web");

/** Assistant prompt for reading/analyzing content (NOT tool-building). */
const ASSISTANT_PROMPT =
  "You are Maker's assistant. Read, analyze, summarize, and answer questions about " +
  "the content the user gives you (files, folders, images, text). Be concise and " +
  "accurate. You are not building a tool here — just help them understand it.";

const READ_SKIP = new Set([
  "node_modules", ".git", ".maker", "dist", "build", ".next", ".cache", "vendor", "target",
]);

/** Read a folder's text files, with limits, for analysis. Skips huge/binary/dep dirs. */
async function readFolder(
  dir: string,
  limits = { maxFiles: 25, maxFileBytes: 8000, maxTotalBytes: 90000 },
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  let total = 0;
  async function walk(cur: string, rel: string): Promise<void> {
    if (out.length >= limits.maxFiles || total >= limits.maxTotalBytes) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limits.maxFiles || total >= limits.maxTotalBytes) break;
      if (e.name.startsWith(".") && e.name !== ".gitignore") continue;
      if (e.isDirectory()) {
        if (READ_SKIP.has(e.name)) continue;
        await walk(path.join(cur, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else if (e.isFile()) {
        try {
          const buf = await fs.readFile(path.join(cur, e.name));
          if (buf.includes(0)) continue; // binary — skip
          const content = buf.toString("utf8").slice(0, limits.maxFileBytes);
          out.push({ path: rel ? `${rel}/${e.name}` : e.name, content });
          total += content.length;
        } catch {
          // unreadable — skip
        }
      }
    }
  }
  const st = await fs.stat(dir); // throws if the folder doesn't exist
  if (!st.isDirectory()) throw new Error(`${dir} is not a folder`);
  await walk(dir, "");
  return out;
}

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

/** Reveal a file/folder in the OS file manager (selecting the file when possible). */
function revealPath(target: string): void {
  let cmd: string, args: string[];
  const dir = path.dirname(target);
  if (process.platform === "darwin") {
    // Absolute path: a Finder-launched app has a minimal PATH that may not resolve
    // bare "open", so the reveal silently did nothing in the packaged build.
    cmd = "/usr/bin/open"; args = ["-R", target]; // Finder: reveal + select
  } else if (process.platform === "win32") {
    cmd = "explorer"; args = [`/select,${target}`];
  } else {
    cmd = "xdg-open"; args = [dir]; // Linux: open the containing folder
  }
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort
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
  /** Bind address. Default 127.0.0.1 (localhost only). "0.0.0.0" exposes to the LAN. */
  readonly host?: string;
  /** When set, every request must present this token (LAN mode). */
  readonly token?: string;
}

/** LAN IPv4 addresses of this machine (for the "open on your phone" URL). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function cookieToken(cookie: string | undefined): string | undefined {
  return cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("maker_token="))
    ?.slice("maker_token=".length);
}

export async function startServer(
  opts: ServeOptions = {},
): Promise<{ url: string; close: () => Promise<void>; token?: string }> {
  const host = opts.host ?? "127.0.0.1";
  const token = opts.token;
  const backendName = process.env["MAKER_BACKEND"] ?? "echo";
  const store = fileMemoryStore();

  // Clean up any llama-server processes orphaned by a previous run that was
  // force-quit or crashed (they aren't reaped automatically) — prevents model
  // servers from silently accumulating across launches and eating memory.
  reapOrphanModelServers();

  // Turnkey (H6.3): run the downloaded model ourselves (fetch runtime + start
  // llama-server) — no external tools. A SWITCHABLE backend so that downloading a
  // model from the running app starts using it immediately, with no restart.
  let currentBackend: InferenceBackend = makeInference(backendName);
  let modelRuntimeStop: (() => void) | undefined;
  let requestOverride: InferenceBackend | undefined; // per-request routing (vision)
  // Are we on a REAL model, or the echo stub? Echo just echoes text — so instead
  // of confusing the user, we guide them to download a model.
  let realModelActive = backendName !== "echo";
  const NO_MODEL_MSG =
    "⚠ No local model is loaded yet — Maker is running its built-in stub, so it can only echo, not build.\n\n" +
    "To build real tools, open **⛁ Models** (top-right) and **Download** one — Qwen2.5-Coder 7B is a good start — " +
    "or type **/setup**. It's a one-time download; after that Maker works fully offline. Once a model is active, " +
    "ask again (or 🎤 speak) and I'll build it.";
  const inference: InferenceBackend = {
    name: "maker",
    isAvailable: () => (requestOverride ?? currentBackend).isAvailable(),
    async *generate(req) {
      if (!realModelActive && !requestOverride) {
        yield NO_MODEL_MSG; // don't echo — tell the user to get a model
        return;
      }
      yield* (requestOverride ?? currentBackend).generate(req);
    },
  };

  // --- Capability router (H9.3 → H9.8): route a request to the best installed
  //     model (vision for images, coder for build tasks), starting it on demand,
  //     caching per model id, and reusing it. All backends stopped on exit. ---
  // Registry of running model servers for memory accounting + targeted stop.
  interface RunningModel {
    modelId: string; url: string; pid?: number; sizeGB?: number;
    kind: "active" | "routed"; startedAt: number; stop: () => void;
  }
  let activeModelRt: RunningModel | null = null;
  const modelBackends = new Map<string, { backend: InferenceBackend; rt: RunningModel }>();
  const installedVisionIds = async (): Promise<string[]> => {
    const out: string[] = [];
    for (const m of await listInstalledModels()) {
      if (await fs.access(mmprojPath(m.id)).then(() => true, () => false)) out.push(m.id);
    }
    return out;
  };
  const ensureModelBackend = async (modelId: string): Promise<InferenceBackend | null> => {
    const cached = modelBackends.get(modelId);
    if (cached) return cached.backend;
    // MEMORY SAFETY: keep at most ONE routed model resident besides the active
    // one — stop the oldest routed server before loading another, so vision +
    // coder + variants can't stack into an out-of-memory condition.
    while (modelBackends.size >= 1) {
      const oldest = [...modelBackends.entries()].sort((a, b) => a[1].rt.startedAt - b[1].rt.startedAt)[0];
      if (!oldest) break;
      try { oldest[1].rt.stop(); } catch { /* already gone */ }
      modelBackends.delete(oldest[0]);
      process.stdout.write(`Freed routed model ${oldest[0]} to make room for ${modelId}.\n`);
    }
    const rt = await startModelRuntime({ modelId });
    if (!rt) return null;
    const backend = llamaCppInference({ host: rt.url });
    modelBackends.set(modelId, {
      backend,
      rt: { modelId, url: rt.url, pid: rt.pid, sizeGB: rt.sizeGB, kind: "routed", startedAt: Date.now(), stop: rt.stop },
    });
    process.stdout.write(`Model ${modelId} ready for routing (${rt.url}).\n`);
    return backend;
  };
  const stopRoutedBackends = (): void => {
    for (const { rt } of modelBackends.values()) { try { rt.stop(); } catch { /* already gone */ } }
    modelBackends.clear();
  };
  /** All currently-running model servers (active + routed) for the Memory panel. */
  const listRunningModels = (): RunningModel[] => {
    const out: RunningModel[] = [];
    if (activeModelRt) out.push(activeModelRt);
    for (const { rt } of modelBackends.values()) out.push(rt);
    return out;
  };
  /** Stop a specific running model server by id (routed, or the active one). */
  const stopRunningModel = (modelId: string): boolean => {
    const routed = modelBackends.get(modelId);
    if (routed) { try { routed.rt.stop(); } catch { /* gone */ } modelBackends.delete(modelId); return true; }
    if (activeModelRt?.modelId === modelId) {
      try { modelRuntimeStop?.(); } catch { /* gone */ }
      modelRuntimeStop = undefined; activeModelRt = null;
      currentBackend = makeInference("echo"); realModelActive = false; // fall back until re-activated
      return true;
    }
    return false;
  };
  // Decide + apply routing for a request; returns a transcript note/warn.
  const beginRoute = async (request: string, images: string[]): Promise<{ note?: string; warn?: string }> => {
    requestOverride = undefined;
    // Cloud escalation (H9.9) — strictly opt-in. Only when a provider is configured
    // AND the mode allows it (always, or auto + a hard prompt). Off by default.
    const provider = await activeProvider(store);
    if (provider) {
      const mode = await getEscalationMode(store);
      const gauge = gaugeComplexity(request);
      if (shouldEscalate({ mode, hasProvider: true, hard: gauge.hard })) {
        requestOverride = cloudInference({
          baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model,
          label: `${provider.label}/${provider.model}`,
        });
        const why = mode === "always" ? "cloud mode: always" : `hard prompt (${gauge.reasons.join(", ")})`;
        return { note: `☁ Answered by ${provider.label}/${provider.model} — this LEFT YOUR DEVICE over the network (${why}).\n\n` };
      }
    }
    const activeId = await getActiveModel();
    const task = classifyTask(request, images.length > 0);
    const installedIds = (await listInstalledModels()).map((m) => m.id);
    const visionIds = await installedVisionIds();
    // Vision needs a model that can see: warn if none installed.
    if (task === "vision" && !(activeId && visionIds.includes(activeId)) && visionIds.length === 0) {
      return {
        warn: `⚠ Your current model (${activeId ?? "none"}) is text-only and no vision model is installed. ` +
          `Download one in ⛁ Models (Qwen2.5-VL 7B ~6GB, or Moondream2 ~2GB) and I'll read your image. Continuing with just your text.\n\n`,
      };
    }
    const route = routeModel({ task, activeId, installedIds, visionIds });
    if (route.modelId && route.modelId !== activeId) {
      const backend = await ensureModelBackend(route.modelId);
      if (backend) {
        requestOverride = backend;
        const icon = task === "vision" ? "👁" : "🔀";
        return { note: `${icon} Answered by ${route.modelId} — ${route.reason} (active model: ${activeId ?? "none"}).\n\n` };
      }
    }
    return task === "vision" && activeId ? { note: `👁 Reading your image with ${activeId}.\n\n` } : {};
  };
  const endRoute = (): void => { requestOverride = undefined; };
  const visionRouter = { begin: beginRoute, end: endRoute };
  const activateModelRuntime = async (): Promise<string | null> => {
    // MEMORY SAFETY: stop the previously-active model BEFORE loading the new one,
    // so switching models never holds two full models resident at once.
    try { modelRuntimeStop?.(); } catch { /* already gone */ }
    modelRuntimeStop = undefined;
    activeModelRt = null;
    try {
      const runtime = await startModelRuntime();
      if (runtime) {
        modelRuntimeStop = runtime.stop;
        currentBackend = llamaCppInference({ host: runtime.url });
        realModelActive = true; // a real model is now serving — stop guiding to download
        activeModelRt = { modelId: runtime.modelId, url: runtime.url, pid: runtime.pid, sizeGB: runtime.sizeGB, kind: "active", startedAt: Date.now(), stop: runtime.stop };
        process.stdout.write(`Running ${runtime.modelId} locally (${runtime.url}).\n`);
        return runtime.modelId;
      }
      // Nothing to run (no active model / not downloaded yet) — guide, don't error.
      currentBackend = makeInference("echo"); realModelActive = false;
    } catch (err) {
      // New model failed to start; the old one is already stopped — fall back to
      // guiding mode rather than leaving a dead backend wired in.
      currentBackend = makeInference("echo"); realModelActive = false;
      process.stdout.write(`(Local runtime not ready — ${String(err)}; sideload/Ollama still work.)\n`);
      return `error: ${String(err)}`;
    }
    return null;
  };
  // Lazy model load: do NOT spawn llama-server (and its multiple GB) at startup —
  // the app launches fast and light. The active model loads on the FIRST build or
  // chat instead, via ensureActiveModelLoaded() below.
  const ensureActiveModelLoaded = async (): Promise<void> => {
    if (activeModelRt) return; // already loaded this session
    if (!(await getActiveModel())) return; // no model chosen yet — nothing to load
    await activateModelRuntime();
  };

  const toolsDir = path.join(os.homedir(), ".maker", "tools");
  let lastToolId: string | undefined;
  const maker: Maker = createMaker({
    inference,
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
    registry: toolRegistry(store),
    multiTool: true,
    genParams: () => generationParams(store),
    onToolBuilt: async (toolId) => {
      lastToolId = toolId;
      const p = await getActiveProject(store);
      await addToolToProject(store, p.id, toolId);
      await runHooks(store, "tool-built", { toolId });
      await recordToolBuilt(store);
    },
  });
  await maker.restore();
  await recordSession(store);
  const scheduleRunner = startScheduleRunner(maker, store);
  const watcher = await startWatcher(store); // H9.6: file-change hooks on granted folders

  const resolveDir = (p: string): string => {
    const home = os.homedir();
    let d = p.trim();
    if (d === "~") d = home;
    else if (d.startsWith("~/")) d = path.join(home, d.slice(2));
    else if (d.startsWith("~")) d = path.join(home, d.slice(1)); // "~Downloads"
    return path.resolve(d);
  };

  // Find the tool to save: the one built this session, else the newest on disk.
  const currentToolDir = async (): Promise<string | undefined> => {
    if (lastToolId) return path.join(toolsDir, lastToolId);
    try {
      const entries = await fs.readdir(toolsDir, { withFileTypes: true });
      const dirs: { name: string; mtime: number }[] = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        try {
          const st = await fs.stat(path.join(toolsDir, e.name, "index.html"));
          dirs.push({ name: e.name, mtime: st.mtimeMs });
        } catch {
          // no index.html — not a runnable tool dir
        }
      }
      dirs.sort((a, b) => b.mtime - a.mtime);
      return dirs[0] ? path.join(toolsDir, dirs[0].name) : undefined;
    } catch {
      return undefined;
    }
  };

  // Copy the current tool's files into an already-permitted folder.
  const saveToolTo = async (dest: string): Promise<string> => {
    const src = await currentToolDir();
    if (!src) throw new Error("No tool built yet — build one first.");
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(src, dest, { recursive: true });
    return dest;
  };

  const server = http.createServer((req, res) => {
    // Token gate (LAN mode): accept ?token=…, the maker_token cookie, or the
    // x-maker-token header. Localhost mode (no token) is open as before.
    if (token) {
      const q = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
      const provided = q ?? cookieToken(req.headers.cookie) ?? (req.headers["x-maker-token"] as string | undefined);
      if (provided !== token) {
        res.statusCode = 401;
        res.end("Unauthorized — open this URL with ?token=… (see the terminal where you ran `maker serve --lan`).");
        return;
      }
      if (q === token) res.setHeader("set-cookie", `maker_token=${token}; Path=/; SameSite=Strict`);
    }
    void handle(req, res, maker, store, activateModelRuntime, saveToolTo, resolveDir, inference, visionRouter, listRunningModels, stopRunningModel, ensureActiveModelLoaded).catch((err: unknown) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });

  const port = opts.port ?? Number(process.env["MAKER_GUI_PORT"] ?? 4319);
  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr !== null ? addr.port : port;
  const url = `http://127.0.0.1:${actualPort}/`;

  if (opts.open !== false) openBrowser(url);

  return {
    url,
    ...(token ? { token } : {}),
    close: () =>
      new Promise<void>((resolve) => {
        scheduleRunner.stop();
        watcher.stop();
        modelRuntimeStop?.();
        stopRoutedBackends();
        void maker.stop().finally(() => server.close(() => resolve()));
      }),
  };
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maker: Maker,
  store: ReturnType<typeof fileMemoryStore>,
  activateModelRuntime: () => Promise<string | null>,
  saveToolTo: (dest: string) => Promise<string>,
  resolveDir: (p: string) => string,
  inference: InferenceBackend,
  visionRouter: {
    begin: (request: string, images: string[]) => Promise<{ note?: string; warn?: string }>;
    end: () => void;
  },
  listRunningModels: () => Array<{ modelId: string; url: string; pid?: number; sizeGB?: number; kind: "active" | "routed" }>,
  stopRunningModel: (modelId: string) => boolean,
  ensureActiveModelLoaded: () => Promise<void>,
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

  // --- save the current tool to a folder, with permission (like Claude Code) ---
  if (url === "/api/save" && method === "POST") {
    const body = await readJson(req);
    const dest = resolveDir(String(body["dir"] ?? path.join(os.homedir(), "Downloads", "my-tool")));
    const force = body["force"] === true;
    res.setHeader("content-type", "application/json");
    if (!force && !(await isGranted(store, dest))) {
      // Not permitted yet — ask the user (the GUI shows Allow/Deny).
      res.end(JSON.stringify({ needsPermission: true, dir: dest, parent: path.dirname(dest) }));
      return;
    }
    try {
      const path0 = await saveToolTo(dest);
      res.end(JSON.stringify({ path: path0 }));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  if (url === "/api/permissions/grant" && method === "POST") {
    const body = await readJson(req);
    await grantPath(store, resolveDir(String(body["dir"] ?? "")));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url === "/api/permissions" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ granted: await listGrantedPaths(store) }));
    return;
  }
  if (url === "/api/permissions/revoke" && method === "POST") {
    const body = await readJson(req);
    await revokePath(store, resolveDir(String(body["dir"] ?? "")));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // Drop the chat transcript (fresh model context); tool/Brief/memory stay.
  if (url === "/api/clear" && method === "POST") {
    maker.clearConversation();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url === "/api/doctor" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ text: formatDoctor(await runDoctor()) }));
    return;
  }
  // --- OPTIONAL cloud connect (H9.9) — off by default; keys stay local ---
  if (url === "/api/cloud" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      providers: (await listProviders(store)).map(redact), // key redacted for display
      mode: await getEscalationMode(store),
    }));
    return;
  }
  if (url === "/api/cloud/add" && method === "POST") {
    const b = await readJson(req);
    await addProvider(store, {
      id: String(b["id"] || "custom"),
      label: String(b["label"] || b["id"] || "cloud"),
      baseUrl: String(b["baseUrl"] || ""),
      model: String(b["model"] || ""),
      apiKey: String(b["apiKey"] || ""),
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url === "/api/cloud/remove" && method === "POST") {
    const b = await readJson(req);
    const ok = await removeProvider(store, String(b["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok }));
    return;
  }
  if (url === "/api/cloud/mode" && method === "POST") {
    const b = await readJson(req);
    const mode = String(b["mode"]);
    if (mode === "never" || mode === "auto" || mode === "always") await setEscalationMode(store, mode);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, mode }));
    return;
  }
  // --- voice input (speak to build) ---
  if (url === "/api/voice/status" && method === "GET") {
    res.setHeader("content-type", "application/json");
    // hasModel = a whisper voice model is downloaded. localReady = a whisper
    // runtime is serving it (the offline transcribe path). The runtime auto-spawn
    // is the offline-completion step; until then the GUI uses the browser
    // recognizer as a clearly-labeled fallback. /api/transcribe (whisper
    // CppTranscriber over the running server) is wired for when that lands.
    res.end(JSON.stringify({ hasModel: await hasWhisperModel(), localReady: false }));
    return;
  }
  if (url === "/api/transcribe" && method === "POST") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ needsLocal: true, reason: "Local voice runtime not running yet — use the browser recognizer, or download a voice model for fully-offline voice." }));
    return;
  }
  // --- multi-tool workshop (H9.1) ---
  if (url === "/api/tools" && method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ tools: await maker.listTools(), current: maker.toolId }));
    return;
  }
  if (url === "/api/tools/open" && method === "POST") {
    const body = await readJson(req);
    const ok = await maker.openTool(String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok, current: maker.toolId, url: maker.running?.url ?? null, goal: maker.brief.goal }));
    return;
  }
  if (url === "/api/tools/new" && method === "POST") {
    maker.newTool();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url === "/api/undo" && method === "POST") {
    const r = await maker.undo();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ...r, url: maker.running?.url ?? null }));
    return;
  }

  // --- read a local folder (with permission), for analysis ---
  if (url === "/api/read" && method === "POST") {
    const body = await readJson(req);
    const dir = resolveDir(String(body["dir"] ?? ""));
    const force = body["force"] === true;
    res.setHeader("content-type", "application/json");
    if (!body["dir"]) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "no folder given" }));
      return;
    }
    if (!force && !(await isGranted(store, dir))) {
      res.end(JSON.stringify({ needsPermission: true, dir, parent: path.dirname(dir), action: "read" }));
      return;
    }
    try {
      const files = await readFolder(dir);
      res.end(JSON.stringify({ dir, files }));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // --- general assistant query (analysis; NOT tool-building) ---
  if (url === "/api/chat" && method === "POST") {
    const body = await readJson(req);
    const request = String(body["request"] ?? "");
    const images = Array.isArray(body["images"]) ? body["images"].map(String) : [];
    await recordPrompt(store, request);
    sse(res);
    const vrc = await visionRouter.begin(request, images);
    if (vrc.note || vrc.warn) {
      res.write(`data: ${JSON.stringify({ type: "assistant-delta", text: vrc.note ?? vrc.warn })}\n\n`);
    }
    await ensureActiveModelLoaded(); // lazy: load the active model on the first chat
    try {
      const gen = inference.generate({
        messages: [
          { role: "system", content: ASSISTANT_PROMPT },
          { role: "user", content: request },
        ],
        maxTokens: 2048, // cap so an ungrounded assistant turn can't run away
        ...(images.length ? { images } : {}),
      });
      for await (const chunk of gen) {
        res.write(`data: ${JSON.stringify({ type: "assistant-delta", text: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: "assistant-done" })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`);
    } finally {
      visionRouter.end();
    }
    res.write("event: done\ndata: {}\n\n");
    res.end();
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
    const images = Array.isArray(body["images"]) ? body["images"].map(String) : [];
    sse(res);
    // Vision routing (H9.3): route image requests to a vision model if needed,
    // else warn. The note tells the user which model is answering.
    const vr = await visionRouter.begin(request, images);
    if (vr.note || vr.warn) {
      res.write(`data: ${JSON.stringify({ type: "assistant-delta", text: vr.note ?? vr.warn })}\n\n`);
    }
    await ensureActiveModelLoaded(); // lazy: load the active model on the first build
    try {
      for await (const ev of maker.express(request, images.length ? { images } : undefined)) {
        if (ev.type === "tool-running") void runHooks(store, "tool-running", { url: ev.url });
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`);
    } finally {
      visionRouter.end();
    }
    res.write("event: done\ndata: {}\n\n");
    res.end();
    return;
  }

  // --- model management ---
  if (url === "/api/models" && method === "GET") {
    const payload = (await modelsPayload()) as Record<string, unknown>;
    // resettable = a reset would actually delete something the user cares about
    // (a model, a built tool, or user memory) — else the button is inert.
    const tools = await maker.listTools();
    const roles = await getRoles(store);
    const macros = await listMacros(store);
    const hist = await historyOverview(store);
    payload["resettable"] =
      (payload["installed"] as unknown[]).length > 0 ||
      tools.length > 0 || roles.length > 0 || macros.length > 0 || hist.prompts.length > 0;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
    return;
  }
  // Reveal a downloaded model in the OS file manager (Finder / Explorer / files).
  if (url === "/api/reveal" && method === "POST") {
    const body = await readJson(req);
    const id = String(body["id"] ?? "");
    const target = id ? path.join(os.homedir(), ".maker", "models", `${id}.gguf`) : path.join(os.homedir(), ".maker", "models");
    revealPath(target);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, path: target }));
    return;
  }
  if (url === "/api/models/use" && method === "POST") {
    const body = await readJson(req);
    await setActiveModel(String(body["id"]));
    // Hot-swap the runtime onto the newly selected model (was: set-only, so the
    // old model kept serving until a restart).
    const swapped = await activateModelRuntime();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ active: String(body["id"]), running: swapped }));
    return;
  }
  if (url === "/api/models/running" && method === "GET") {
    // Running model servers (active + routed) with pid/size — for the Memory panel.
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ models: listRunningModels().map((m) => ({ modelId: m.modelId, pid: m.pid, sizeGB: m.sizeGB, kind: m.kind, url: m.url })) }));
    return;
  }
  if (url === "/api/models/stop" && method === "POST") {
    // Stop a specific running model server (free its memory). Frees a routed
    // model outright; stopping the active model drops back to guiding mode.
    const body = await readJson(req);
    const stopped = stopRunningModel(String(body["id"]));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ stopped }));
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
      // Fetch the runtime + start it, and hot-swap the running app onto the model
      // so you can build immediately — no restart. Non-fatal.
      res.write(`data: ${JSON.stringify({ note: "Model downloaded. Preparing the runtime…" })}\n\n`);
      const activated = await activateModelRuntime();
      if (activated && !activated.startsWith("error:")) {
        res.write(`data: ${JSON.stringify({ note: `Ready — ${activated} is running. You can build now.` })}\n\n`);
      } else if (activated) {
        res.write(`data: ${JSON.stringify({ note: `Model ready, but the runtime didn't start (${activated.slice(7)}). Sideload/Ollama still work.` })}\n\n`);
      }
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

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * `maker serve` — the browser mode. Localhost-only by default (open, safe). With
 * `--lan` it binds to the network AND requires a token, so you can open the
 * workshop from your phone/tablet on the same Wi-Fi without leaving it open to
 * everyone. Flags: --lan, --port <n>, --token <t>, --no-open.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lan = args.includes("--lan");
  const noOpen = args.includes("--no-open") || Boolean(process.env["MAKER_NO_OPEN"]);
  const port = Number(argValue(args, "--port") ?? process.env["MAKER_GUI_PORT"] ?? 4319);
  const token = lan ? (argValue(args, "--token") ?? randomBytes(12).toString("hex")) : undefined;
  const backend = process.env["MAKER_BACKEND"] ?? "echo";

  const { url } = await startServer({
    port,
    host: lan ? "0.0.0.0" : "127.0.0.1",
    open: !noOpen && !lan, // in LAN mode you open it on the OTHER device
    ...(token ? { token } : {}),
  });

  if (!lan) {
    process.stdout.write(`Maker running → ${url}\n(Backend: ${backend}. Localhost only. Ctrl+C to stop.)\n`);
    return;
  }

  const actualPort = new URL(url).port;
  process.stdout.write(
    `Maker running in LAN mode (backend: ${backend}). Ctrl+C to stop.\n\n` +
      `Open on another device on this Wi-Fi (include the token):\n`,
  );
  const addrs = lanAddresses();
  if (addrs.length === 0) process.stdout.write("  (no LAN address found)\n");
  for (const a of addrs) process.stdout.write(`  http://${a}:${actualPort}/?token=${token}\n`);
  process.stdout.write(
    `\nOn this machine: http://127.0.0.1:${actualPort}/?token=${token}\n` +
      `Token: ${token}\n` +
      `⚠ Anyone on your network with this URL + token can use this workshop. Keep the token private;\n` +
      `  Ctrl+C stops it.\n`,
  );
}

const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
