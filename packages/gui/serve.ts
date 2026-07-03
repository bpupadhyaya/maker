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
} from "../engine/src/index.ts";
import type { InferenceBackend, Maker } from "../engine/src/index.ts";
import { localWebRuntime } from "../runtime/src/index.ts";
import {
  fileMemoryStore, tasteMemory, toolRegistry, getRoles, setRoles, isOnboarded,
  listProjects, createProject, getActiveProject, setActiveProject, addToolToProject,
  setMacro, removeMacro, listMacros, resolveMacro,
  grantPath, isGranted, listGrantedPaths, revokePath,
  addSchedule, listSchedules, removeSchedule, cronLineFor, startScheduleRunner,
  addHook, listHooks, removeHook, runHooks,
  recordPrompt, historyOverview, searchHistory,
  getSettings, setSetting,
  recordSession, recordToolBuilt, recordTokens, getStats,
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
  ensureRuntime,
  shouldFetchRuntime,
  mmprojPath,
  decideVisionRoute,
} from "../provision/src/index.ts";

/**
 * The GUI, runnable today with NO Rust/Tauri: a tiny Node server that serves the
 * web UI, bridges the conversation to the engine over SSE, and exposes model
 * management as REST. Tauri (G5) is just native packaging on top of this.
 */
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");

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

  // Turnkey (H6.3): run the downloaded model ourselves (fetch runtime + start
  // llama-server) — no external tools. A SWITCHABLE backend so that downloading a
  // model from the running app starts using it immediately, with no restart.
  let currentBackend: InferenceBackend = makeInference(backendName);
  let modelRuntimeStop: (() => void) | undefined;
  let requestOverride: InferenceBackend | undefined; // per-request routing (vision)
  const inference: InferenceBackend = {
    name: "maker",
    isAvailable: () => (requestOverride ?? currentBackend).isAvailable(),
    generate: (req) => (requestOverride ?? currentBackend).generate(req),
  };

  // --- Vision routing (H9.3): lazily start an installed vision model on demand,
  //     cache it, and reuse for image requests. Stopped on process exit. ---
  let visionBackend: InferenceBackend | undefined;
  let visionStop: (() => void) | undefined;
  let visionModelId: string | undefined;
  const installedVisionIds = async (): Promise<string[]> => {
    const out: string[] = [];
    for (const m of await listInstalledModels()) {
      if (await fs.access(mmprojPath(m.id)).then(() => true, () => false)) out.push(m.id);
    }
    return out;
  };
  const ensureVisionBackend = async (): Promise<{ backend: InferenceBackend; modelId: string } | null> => {
    if (visionBackend && visionModelId) return { backend: visionBackend, modelId: visionModelId };
    const ids = await installedVisionIds();
    const vid = ids[0];
    if (!vid) return null;
    const rt = await startModelRuntime({ modelId: vid });
    if (!rt) return null;
    visionStop = rt.stop;
    visionModelId = rt.modelId;
    visionBackend = llamaCppInference({ host: rt.url });
    process.stdout.write(`Vision model ${vid} ready for image requests (${rt.url}).\n`);
    return { backend: visionBackend, modelId: vid };
  };
  // Decide + apply routing for a request's images; returns a transcript note/warn.
  const beginVisionRoute = async (images: string[]): Promise<{ note?: string; warn?: string }> => {
    requestOverride = undefined;
    if (!images.length) return {};
    const activeId = await getActiveModel();
    const activeHasVision = activeId
      ? await fs.access(mmprojPath(activeId)).then(() => true, () => false)
      : false;
    const vids = await installedVisionIds();
    const route = decideVisionRoute({ hasImages: true, activeHasVision, installedVisionIds: vids });
    if (route === "primary") {
      return activeHasVision ? { note: `👁 Reading your image with ${activeId}.\n\n` } : {};
    }
    if (route === "route-vision") {
      const v = await ensureVisionBackend();
      if (v) {
        requestOverride = v.backend;
        return { note: `👁 Routed to vision model ${v.modelId} to read your image (builder model stays ${activeId ?? "primary"}).\n\n` };
      }
    }
    return {
      warn: `⚠ Your current model (${activeId ?? "none"}) is text-only and no vision model is installed. ` +
        `Download one in ⛁ Models (Qwen2.5-VL 7B ~6GB, or Moondream2 ~2GB) and I'll read your image. Continuing with just your text.\n\n`,
    };
  };
  const endVisionRoute = (): void => { requestOverride = undefined; };
  const visionRouter = { begin: beginVisionRoute, end: endVisionRoute };
  const activateModelRuntime = async (): Promise<string | null> => {
    try {
      const runtime = await startModelRuntime();
      if (runtime) {
        modelRuntimeStop?.();
        modelRuntimeStop = runtime.stop;
        currentBackend = llamaCppInference({ host: runtime.url });
        process.stdout.write(`Running ${runtime.modelId} locally (${runtime.url}).\n`);
        return runtime.modelId;
      }
    } catch (err) {
      process.stdout.write(`(Local runtime not ready — ${String(err)}; sideload/Ollama still work.)\n`);
      return `error: ${String(err)}`;
    }
    return null;
  };
  await activateModelRuntime();

  const toolsDir = path.join(os.homedir(), ".maker", "tools");
  let lastToolId: string | undefined;
  const maker: Maker = createMaker({
    inference,
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
    registry: toolRegistry(store),
    multiTool: true,
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
    void handle(req, res, maker, store, activateModelRuntime, saveToolTo, resolveDir, inference, visionRouter).catch((err: unknown) => {
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
        modelRuntimeStop?.();
        visionStop?.();
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
    begin: (images: string[]) => Promise<{ note?: string; warn?: string }>;
    end: () => void;
  },
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
    const vrc = await visionRouter.begin(images);
    if (vrc.note || vrc.warn) {
      res.write(`data: ${JSON.stringify({ type: "assistant-delta", text: vrc.note ?? vrc.warn })}\n\n`);
    }
    try {
      const gen = inference.generate({
        messages: [
          { role: "system", content: ASSISTANT_PROMPT },
          { role: "user", content: request },
        ],
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
    const vr = await visionRouter.begin(images);
    if (vr.note || vr.warn) {
      res.write(`data: ${JSON.stringify({ type: "assistant-delta", text: vr.note ?? vr.warn })}\n\n`);
    }
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
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(await modelsPayload()));
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
