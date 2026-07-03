import * as readline from "node:readline";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  createMaker,
  echoInference,
  ollamaInference,
  llamaCppInference,
  mlxInference,
} from "../../engine/src/index.ts";
import type { InferenceBackend } from "../../engine/src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";
import {
  fileMemoryStore, tasteMemory, getRoles, setRoles,
  listProjects, createProject, getActiveProject, setActiveProject, addToolToProject,
  setMacro, removeMacro, listMacros, resolveMacro,
  addSchedule, listSchedules, removeSchedule, cronLineFor, startScheduleRunner,
  addHook, listHooks, removeHook, runHooks, startWatcher,
  recordPrompt, historyOverview, searchHistory,
  getSettings, setSetting, generationParams,
  recordSession, recordToolBuilt, recordTokens, getStats,
  grantPath, isGranted, listGrantedPaths, revokePath,
} from "../../store/src/index.ts";
import type { Settings } from "../../store/src/index.ts";
import type { HookEvent } from "../../store/src/index.ts";
import { ROLES, roleById, STARTERS, starterById, orderedStarters, startersForRoles } from "../../engine/src/index.ts";
import { renderEvent } from "./render.ts";
import { runDoctor, formatDoctor } from "./doctor.ts";
import {
  detectHardware,
  selectModel,
  chooseInstaller,
  chooseBackendKind,
  MODEL_CATALOG,
  listInstalledModels,
  modelDiskUsage,
  getActiveModel,
  setActiveModel,
  removeModel,
  removeAllModels,
  resetMakerData,
  startModelRuntime,
  provisionModelAndRuntime,
  detectRuntime,
  checkProvisioned,
} from "../../provision/src/index.ts";
import type { MakerEvent } from "../../engine/src/index.ts";
import { runMakerConversation } from "./controller.ts";

function openBrowser(url: string): void {
  if (process.env["MAKER_NO_OPEN"]) return;
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
    // best-effort
  }
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}

/**
 * The M0.3 terminal entrypoint: a zero-dependency readline REPL, a thin client
 * over the engine. `MAKER_BACKEND=ollama` swaps the echo stub for a real local
 * model (M0.2) — nothing else changes, because both are just InferenceBackends.
 *
 * (A richer Ink-based terminal UI — Talk/Split/Build in the terminal — is a
 * later polish milestone; it needs a network install of Ink. This REPL keeps
 * the front-end usable and fully offline today.)
 */
/** Map MAKER_BACKEND to an inference backend (echo = no-model demo). */
function makeInference(name: string, ollamaModel?: string): InferenceBackend {
  switch (name) {
    case "ollama":
      return ollamaModel ? ollamaInference({ model: ollamaModel }) : ollamaInference();
    case "llamacpp":
    case "llama.cpp":
      return llamaCppInference();
    case "mlx":
      return mlxInference();
    default:
      return echoInference();
  }
}

export async function main(): Promise<void> {
  const backendName = process.env["MAKER_BACKEND"] ?? "echo";
  const active = await getActiveModel();
  const activeEntry = active
    ? MODEL_CATALOG.find((m) => m.id === active)
    : undefined;

  // Turnkey (H6.3): if a model is downloaded, the app runs it itself — fetch the
  // runtime + start llama-server, no external tools. Falls back cleanly otherwise.
  const store = fileMemoryStore();
  // Stable wrapper so /use can hot-swap the live backend without recreating the maker.
  let currentBackend = makeInference(backendName, activeEntry?.ollama);
  let modelRuntimeStop: (() => void) | undefined;
  const inference: InferenceBackend = {
    name: "maker",
    isAvailable: () => currentBackend.isAvailable(),
    generate: (req) => currentBackend.generate(req),
  };
  const activateModelRuntime = async (modelId?: string): Promise<string | null> => {
    try {
      const runtime = await startModelRuntime({
        ...(modelId ? { modelId } : {}),
        onProgress: (msg) => process.stdout.write(`  ${msg}\n`),
      });
      if (runtime) {
        modelRuntimeStop?.();
        modelRuntimeStop = runtime.stop;
        currentBackend = llamaCppInference({ host: runtime.url });
        process.stdout.write(`Running ${runtime.modelId} locally (${runtime.url}).\n`);
        return runtime.modelId;
      }
    } catch (err) {
      process.stdout.write(`(Local runtime not ready — ${String(err)}\n Sideload a .gguf or use Ollama meanwhile.)\n`);
    }
    return null;
  };
  await activateModelRuntime();

  const maker = createMaker({
    inference,
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
    multiTool: true,
    genParams: () => generationParams(store),
    onToolBuilt: async (toolId) => {
      const p = await getActiveProject(store);
      await addToolToProject(store, p.id, toolId);
      await runHooks(store, "tool-built", { toolId });
      await recordToolBuilt(store);
    },
  });
  await maker.restore();
  await recordSession(store);

  const write = (text: string): void => {
    process.stdout.write(text);
  };

  process.stdout.write(
    `Maker — terminal (v1), backend=${backendName}. Describe a tool; /help for all commands (Tab completes); /exit to quit.\n`,
  );

  // Auto-choose how to fetch + run the model (default GGUF/llama.cpp = only-network;
  // Ollama if MAKER_BACKEND=ollama; sideload a local .gguf via MAKER_SIDELOAD).
  const hw = detectHardware();
  const preferOllama = backendName === "ollama";
  const sideloadPath = process.env["MAKER_SIDELOAD"];
  const { installer, kind } = chooseInstaller({
    ...(preferOllama ? { prefer: "ollama" as const } : {}),
    ...(sideloadPath ? { sideloadPath } : {}),
  });
  const runtimeKind = chooseBackendKind(hw, preferOllama ? { prefer: "ollama" } : {});
  const model = selectModel(hw);

  // First-run: if NO model is set up yet, guide (don't demand shell commands).
  // Skip when a model is already active/running — the tier default not being
  // installed doesn't matter then.
  if (!modelRuntimeStop && !active && !(await installer.isInstalled(model))) {
    write(
      `\nHeads up: your local model (${model.name}) isn't set up yet. ` +
        `Type /setup and Maker will get it for you (via ${kind}, runtime ${runtimeKind}; one step, needs internet once).\n`,
    );
  }

  // /setup — app-driven provisioning: downloads the MODEL and the RUNTIME (the
  // one online step). The user triggers it; the app does the rest.
  async function setup(): Promise<void> {
    write(`\nSetting up (via ${kind}, runtime ${runtimeKind}) — downloading your model and runtime…\n`);
    const { model, runtime } = await provisionModelAndRuntime({
      installer,
      hardware: hw,
      onProgress: (p) => {
        const pct = p.ratio !== undefined ? ` ${Math.round(p.ratio * 100)}%` : "";
        write(`  ${p.message}${pct}\n`);
      },
    });
    if (!model.ok) {
      write(`\n✗ ${model.detail}\n`);
      return;
    }
    if (runtime.ok) {
      write(`\n✓ Setup complete — model + runtime ready. Restart Maker and it runs your model offline.\n`);
    } else {
      write(`\n✓ Model ready. Runtime not fetched (${runtime.detail}).\n  You can still use sideload or Ollama; retry later with /setup.\n`);
    }
  }

  // Model management commands (all app-space, ~/.maker/models).
  async function cmdModels(): Promise<void> {
    const installed = await listInstalledModels();
    const activeNow = await getActiveModel();
    write("\nInstalled (in ~/.maker/models):\n");
    if (installed.length === 0) write("  (none — run /setup)\n");
    for (const m of installed) {
      const mark = m.id === activeNow ? "*" : " ";
      write(`  ${mark} ${m.id} — ${m.name} (${gb(m.sizeBytes)})${m.id === activeNow ? " [active]" : ""}\n`);
    }
    if (installed.length > 0) {
      write(`  ── Total disk used: ${gb(await modelDiskUsage())}\n`);
    }
    write("\nAvailable (download via /setup or the GUI Model panel):\n");
    for (const m of MODEL_CATALOG) {
      write(`    ${m.id} — ${m.name} (${m.tier}, ~${m.approxSizeGB}GB)${m.recommended ? " *" : ""}\n`);
    }
    write("\n/use <id> to switch · /remove <id> to free space · /remove-all to clear everything\n");
  }
  async function cmdRemoveAll(): Promise<void> {
    const { removed, freedBytes } = await removeAllModels();
    write(
      removed === 0
        ? "\nNo models to remove.\n"
        : `\nRemoved ${removed} model${removed === 1 ? "" : "s"} — freed ${gb(freedBytes)}.\n`,
    );
  }
  async function cmdReset(arg: string): Promise<void> {
    if (arg !== "yes") {
      write(
        "\n⚠ This removes ALL data — every model, built tool, and memory (~/.maker).\n" +
          "  To confirm, run:  /reset yes\n" +
          "  (To remove the app itself too, use scripts/uninstall.sh or uninstall.command.)\n",
      );
      return;
    }
    const { freedBytes } = await resetMakerData();
    write(`\n✓ Reset complete — freed ${gb(freedBytes)}. Fresh start; run /setup to add a model.\n`);
  }
  async function cmdUse(arg: string): Promise<void> {
    if (!arg) return void write("usage: /use <model-id>\n");
    await setActiveModel(arg);
    write(`\nSwitching to ${arg}…\n`);
    const running = await activateModelRuntime(); // live hot-swap, no relaunch
    write(running ? `✓ Now running ${running}.\n` : `Set active to ${arg} (will apply on next model start).\n`);
  }
  async function cmdRemove(arg: string): Promise<void> {
    if (!arg) return void write("usage: /remove <model-id>\n");
    const removed = await removeModel(arg);
    write(removed ? `\nRemoved ${arg} — freed space.\n` : `\n${arg} was not installed.\n`);
  }

  // Role onboarding (H5.1): a gentle first-run hint, plus a /role command.
  const currentRoles = await getRoles(store);
  if (currentRoles.length === 0) {
    write(
      "\nTip: tell Maker what you make things for so it can suggest starters —\n" +
        `  /role <${ROLES.map((r) => r.id).join("|")}>   (optional; e.g. /role money health)\n`,
    );
  }
  async function cmdRole(arg: string): Promise<void> {
    if (!arg) {
      const now = await getRoles(store);
      write(`\nYour roles: ${now.length ? now.join(", ") : "(none)"}\n`);
      write("Available: " + ROLES.map((r) => `${r.id} (${r.label})`).join(" · ") + "\n");
      write("Set with: /role <ids…>\n");
      return;
    }
    const ids = arg.split(/\s+/).filter((id) => roleById(id));
    await setRoles(store, ids);
    write(`\n✓ Roles set: ${ids.length ? ids.join(", ") : "(none)"} — starters will match.\n`);
  }

  // Quick-start suggestions (H5.2), ordered by role.
  const starterOrder = orderedStarters(startersForRoles(currentRoles));
  write(
    `\nStart with:  ${starterOrder.slice(0, 4).map((s) => s.label.toLowerCase()).join(" · ")}` +
      `   (/starters for all, /starter <id> to build one)\n`,
  );
  async function cmdProject(arg: string): Promise<void> {
    const [sub, ...rest] = arg.split(/\s+/);
    const name = rest.join(" ");
    if (sub === "new" && name) {
      const p = await createProject(store, name);
      await setActiveProject(store, p.id);
      write(`\n✓ Created + switched to project "${p.name}" (${p.id}).\n`);
      return;
    }
    if (sub === "use" && name) {
      await setActiveProject(store, name);
      write(`\n✓ Active project: ${name}.\n`);
      return;
    }
    const active = await getActiveProject(store);
    const projects = await listProjects(store);
    write("\nProjects:\n");
    for (const p of projects) {
      write(`  ${p.id === active.id ? "*" : " "} ${p.id} — ${p.name} (${p.toolIds.length} tools)\n`);
    }
    write("\n/project new <name> · /project use <id>\n");
  }

  // Local scheduling (H5.5): run due schedules while the TUI is open.
  const scheduleRunner = startScheduleRunner(maker, store);
  // File-change watcher (H9.6): fire 'file-change' hooks on granted folders.
  const watcher = await startWatcher(store);
  async function cmdSchedule(arg: string): Promise<void> {
    const parts = arg.split(/\s+/);
    const sub = parts[0];
    if (sub === "add") {
      const everyMinutes = Number(parts[1]);
      const prompt = parts.slice(2).join(" ");
      if (!everyMinutes || !prompt) {
        write("usage: /schedule add <everyMinutes> <prompt…>\n");
        return;
      }
      const s = await addSchedule(store, { prompt, everyMinutes });
      write(`\n✓ Scheduled "${s.prompt}" every ${s.everyMinutes}m (id ${s.id}); runs while Maker is open.\n`);
      write(`  For always-on, add this to cron (needs-user):\n    ${cronLineFor(s)}\n`);
      return;
    }
    if (sub === "remove" && parts[1]) {
      const ok = await removeSchedule(store, parts[1]);
      write(ok ? `\n✓ Removed schedule ${parts[1]}.\n` : `\nSchedule ${parts[1]} not found.\n`);
      return;
    }
    const schedules = await listSchedules(store);
    write("\nSchedules:\n");
    if (!schedules.length) write("  (none — /schedule add <everyMinutes> <prompt…>)\n");
    for (const s of schedules) {
      write(`  ${s.id} — every ${s.everyMinutes}m: "${s.prompt}"${s.lastRun ? "" : " (not run yet)"}\n`);
    }
    write("\n/schedule add <everyMinutes> <prompt…> · /schedule remove <id>\n");
  }

  async function cmdMacro(arg: string): Promise<void> {
    const [sub, name, ...rest] = arg.split(/\s+/);
    const prompt = rest.join(" ");
    if (sub === "add" && name && prompt) {
      await setMacro(store, name, prompt);
      write(`\n✓ Saved macro /${name} → "${prompt}"  (type /${name} to run it)\n`);
      return;
    }
    if (sub === "remove" && name) {
      const ok = await removeMacro(store, name);
      write(ok ? `\n✓ Removed /${name}.\n` : `\n/${name} not found.\n`);
      return;
    }
    const macros = await listMacros(store);
    write("\nMacros:\n");
    if (!macros.length) write("  (none — /macro add <name> <prompt…>)\n");
    for (const m of macros) write(`  /${m.name} → "${m.prompt}"\n`);
    write("\n/macro add <name> <prompt…> · /macro remove <name>\n");
  }

  async function cmdStarters(): Promise<void> {
    write("\nStarters:\n");
    for (const s of STARTERS) write(`  ${s.id} — ${s.label}: "${s.prompt}"\n`);
    write("\nBuild one with: /starter <id>\n");
  }

  // Auto-open the living tool in the browser when it (re)starts.
  let openedUrl = "";
  const onEvent = (ev: MakerEvent): void => {
    if (ev.type === "tool-running" && ev.url !== openedUrl) {
      openedUrl = ev.url;
      openBrowser(ev.url);
      void runHooks(store, "tool-running", { url: ev.url });
    }
  };

  // --- local folder access (permission-gated, like the GUI / Claude Code) ---
  const ASSISTANT_PROMPT =
    "You are Maker's assistant. Read, analyze, summarize, and answer questions about " +
    "the content the user gives you (files, folders, text). Be concise and accurate.";
  const READ_SKIP = new Set(["node_modules", ".git", ".maker", "dist", "build", ".next", "vendor", "target"]);
  const resolveDir = (p: string): string => {
    const home = os.homedir();
    let d = p.trim();
    if (d === "~") d = home;
    else if (d.startsWith("~/")) d = path.join(home, d.slice(2));
    else if (d.startsWith("~")) d = path.join(home, d.slice(1));
    return path.resolve(d);
  };
  const newestToolDir = async (): Promise<string | undefined> => {
    const root = path.join(os.homedir(), ".maker", "tools");
    try {
      const entries = await fsp.readdir(root, { withFileTypes: true });
      const dirs: { name: string; mtime: number }[] = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        try {
          const st = await fsp.stat(path.join(root, e.name, "index.html"));
          dirs.push({ name: e.name, mtime: st.mtimeMs });
        } catch { /* not a tool dir */ }
      }
      dirs.sort((a, b) => b.mtime - a.mtime);
      return dirs[0] ? path.join(root, dirs[0].name) : undefined;
    } catch {
      return undefined;
    }
  };
  const readFolderTui = async (dir: string): Promise<{ path: string; content: string }[]> => {
    const out: { path: string; content: string }[] = [];
    let total = 0;
    const walk = async (cur: string, rel: string): Promise<void> => {
      if (out.length >= 25 || total >= 90000) return;
      let entries: import("node:fs").Dirent[];
      try { entries = await fsp.readdir(cur, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= 25 || total >= 90000) break;
        if (e.name.startsWith(".") && e.name !== ".gitignore") continue;
        if (e.isDirectory()) {
          if (!READ_SKIP.has(e.name)) await walk(path.join(cur, e.name), rel ? `${rel}/${e.name}` : e.name);
        } else if (e.isFile()) {
          try {
            const buf = await fsp.readFile(path.join(cur, e.name));
            if (buf.includes(0)) continue;
            const content = buf.toString("utf8").slice(0, 8000);
            out.push({ path: rel ? `${rel}/${e.name}` : e.name, content });
            total += content.length;
          } catch { /* skip */ }
        }
      }
    };
    const st = await fsp.stat(dir);
    if (!st.isDirectory()) throw new Error(`${dir} is not a folder`);
    await walk(dir, "");
    return out;
  };

  async function cmdAllow(arg: string): Promise<void> {
    if (!arg.trim()) {
      const g = await listGrantedPaths(store);
      write("\nAllowed folders (read + write, incl. subfolders):\n" + (g.length ? g.map((x) => "  " + x).join("\n") : "  (none)") + "\n");
      return;
    }
    const dir = resolveDir(arg);
    await grantPath(store, dir);
    write(`\n✓ Allowed Maker to read/write in ${dir} (and its subfolders).\n`);
  }
  async function cmdSave(arg: string): Promise<void> {
    const dest = arg.trim() ? resolveDir(arg) : path.join(os.homedir(), "Downloads", "maker-tool");
    if (!(await isGranted(store, dest))) {
      write(`\n🔒 ${dest} isn't permitted yet.\n  Allow it:  /allow ${path.dirname(dest)}\n  then run:  /save ${arg.trim()}\n`);
      return;
    }
    const src = await newestToolDir();
    if (!src) { write("\nNo tool built yet — build one first.\n"); return; }
    await fsp.mkdir(dest, { recursive: true });
    await fsp.cp(src, dest, { recursive: true });
    write(`\n✓ Saved your tool to ${dest}\n`);
  }
  async function cmdRead(arg: string): Promise<void> {
    if (!arg.trim()) { write("usage: /read <folder>\n"); return; }
    const dir = resolveDir(arg);
    if (!(await isGranted(store, dir))) {
      write(`\n🔒 ${dir} isn't permitted.\n  Allow it:  /allow ${dir}\n  then run:  /read ${arg.trim()}\n  (Or paste the content here to analyze it directly.)\n`);
      return;
    }
    let files: { path: string; content: string }[];
    try { files = await readFolderTui(dir); } catch (e) { write(`\n✗ Couldn't read ${dir}: ${String(e)}\n`); return; }
    if (!files.length) { write(`\n${dir} has no readable text files.\n`); return; }
    write(`\nRead ${files.length} file(s) from ${dir}. Analyzing…\n\n`);
    const ctx = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    try {
      for await (const chunk of inference.generate({
        messages: [
          { role: "system", content: ASSISTANT_PROMPT },
          { role: "user", content: `Analyze these files from ${dir}:\n\n${ctx}` },
        ],
      })) {
        write(chunk);
      }
    } catch (e) {
      write(`\n✗ ${String(e)}\n`);
    }
    write("\n");
  }

  // Vision (H8.6): /image attaches an image to the next message.
  let pendingImages: string[] = [];
  async function cmdImage(arg: string): Promise<void> {
    const p = arg.trim();
    if (!p) {
      write(`\n${pendingImages.length} image(s) attached to your next message.\n  usage: /image <path-to-image>\n`);
      return;
    }
    try {
      const buf = await fsp.readFile(p.replace(/^~/, process.env["HOME"] ?? "~"));
      const ext = (p.split(".").pop() ?? "png").toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
      pendingImages.push(`data:${mime};base64,${buf.toString("base64")}`);
      write(`\n✓ Attached ${p} — send a message (needs a vision model, e.g. /use qwen2.5-vl-7b).\n`);
    } catch (e) {
      write(`\n✗ Couldn't read ${p}: ${String(e)}\n`);
    }
  }

  async function cmdDoctor(arg: string): Promise<void> {
    const full = /\bfull\b/i.test(arg);
    write(full
      ? "\nChecking… (--full: this will DOWNLOAD + extract the ~11MB runtime)\n"
      : "\nChecking… (this pings GitHub to resolve the runtime; no big download)\n");
    write(formatDoctor(await runDoctor(full ? { full: true } : {})));
  }

  async function cmdStats(): Promise<void> {
    const s = await getStats(store);
    write("\nYour Maker usage (local only):\n");
    write(`  sessions      ${s.sessions}\n`);
    write(`  tools built   ${s.toolsBuilt}\n`);
    write(`  active days   ${s.activeDays}\n`);
    write(`  tokens (est)  ~${s.tokens}\n`);
    if (s.since) write(`  since         ${s.since}\n`);
    write("\n(Nothing here leaves your device.)\n");
  }

  async function cmdSettings(): Promise<void> {
    const s = await getSettings(store);
    write("\nSettings:\n");
    write(`  model         ${s.model || "(active model)"}\n`);
    write(`  effort        ${s.effort}\n`);
    write(`  theme         ${s.theme}\n`);
    write(`  approvalMode  ${s.approvalMode}\n`);
    write("\nChange with: /set <key> <value>  (keys: model effort theme approvalMode)\n");
  }
  async function cmdSet(arg: string): Promise<void> {
    const [key, ...rest] = arg.split(/\s+/);
    const value = rest.join(" ");
    const valid = ["model", "effort", "theme", "approvalMode"];
    if (!valid.includes(key ?? "") || !value) {
      write(`usage: /set <${valid.join("|")}> <value>\n`);
      return;
    }
    const next = await setSetting(store, key as keyof Settings, value);
    if (key === "model") await setActiveModel(value);
    write(`\n✓ ${key} = ${value}${key === "approvalMode" ? " (auto=build first · ask=confirm first)" : ""}\n`);
    void next;
  }

  async function cmdHistory(): Promise<void> {
    const { prompts, tools } = await historyOverview(store);
    write("\nRecent requests:\n");
    for (const p of prompts.slice(-10).reverse()) write(`  · ${p}\n`);
    if (!prompts.length) write("  (none yet)\n");
    write("\nTools built:\n");
    for (const t of tools) write(`  · ${t.name} — ${t.goal}\n`);
    if (!tools.length) write("  (none yet)\n");
    write("\n/search <query> to search across both.\n");
  }
  async function cmdSearch(arg: string): Promise<void> {
    if (!arg.trim()) {
      write("usage: /search <query>\n");
      return;
    }
    const hits = await searchHistory(store, arg);
    write(`\n${hits.length} result${hits.length === 1 ? "" : "s"} for "${arg}":\n`);
    for (const h of hits) write(`  [${h.kind}] ${h.text}\n`);
  }

  async function cmdHook(arg: string): Promise<void> {
    const parts = arg.split(/\s+/);
    const sub = parts[0];
    if (sub === "add") {
      const event = parts[1] as HookEvent;
      const command = parts.slice(2).join(" ");
      if (!["tool-running", "tool-built", "file-change"].includes(event) || !command) {
        write("usage: /hook add <tool-running|tool-built|file-change> <command…>\n");
        return;
      }
      const h = await addHook(store, event, command);
      write(`\n✓ Hook ${h.id}: on ${event} run \`${command}\`\n`);
      return;
    }
    if (sub === "remove" && parts[1]) {
      const ok = await removeHook(store, parts[1]);
      write(ok ? `\n✓ Removed hook ${parts[1]}.\n` : `\nHook ${parts[1]} not found.\n`);
      return;
    }
    const hooks = await listHooks(store);
    write("\nHooks:\n");
    if (!hooks.length) write("  (none — /hook add <event> <command…>)\n");
    for (const h of hooks) write(`  ${h.id} — on ${h.event}: \`${h.command}\`\n`);
    write("\nEvents: tool-running · tool-built · file-change\n");
  }

  async function cmdStarter(arg: string): Promise<void> {
    const s = starterById(arg.trim());
    if (!s) {
      write("usage: /starter <id>  (see /starters)\n");
      return;
    }
    write(`\n» ${s.prompt}\n`);
    for await (const ev of maker.express(s.prompt)) {
      onEvent(ev);
      write(renderEvent(ev));
    }
    write("\n");
  }

  // --- Claude-CLI-style utility commands ---
  async function appVersion(): Promise<string> {
    try {
      const pkg = JSON.parse(await fsp.readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: string };
      return pkg.version ?? "0.0.0";
    } catch {
      return "0.0.0";
    }
  }
  async function cmdTools(): Promise<void> {
    const tools = await maker.listTools();
    write("\nYour tools:\n");
    if (!tools.length) write("  (none yet — describe one to build it)\n");
    for (const t of tools) write(`  ${t.id === maker.toolId ? "*" : " "} ${t.id} — ${t.goal}\n`);
    write("\n/open <id> to reopen · /new to start a fresh tool\n");
  }
  async function cmdOpen(arg: string): Promise<void> {
    if (!arg.trim()) { write("usage: /open <id> (see /tools)\n"); return; }
    const ok = await maker.openTool(arg.trim());
    if (!ok) { write(`\nNo saved tool "${arg.trim()}". See /tools.\n`); return; }
    write(`\n✓ Reopened ${maker.toolId} — "${maker.brief.goal}".\n`);
    if (maker.running) { write(`  Running → ${maker.running.url}\n`); openBrowser(maker.running.url); }
  }
  async function cmdNew(): Promise<void> {
    maker.newTool();
    write("\n✓ New tool — describe what to build.\n");
  }
  async function cmdUndo(): Promise<void> {
    const r = await maker.undo();
    if (r.undone) {
      write("\n↩ Undone — restored the previous version.\n");
      if (maker.running) write(`  Running → ${maker.running.url}\n`);
    } else {
      write("\nNothing to undo — this is the earliest version.\n");
    }
  }

  async function cmdStatus(): Promise<void> {
    const active = await getActiveModel();
    const runtimePath = await detectRuntime();
    const prov = await checkProvisioned();
    const proj = await getActiveProject(store);
    write("\nMaker status\n");
    write(`  version      ${await appVersion()}\n`);
    write(`  platform     ${process.platform}-${process.arch} (node v${process.versions.node})\n`);
    write(`  backend      ${backendName}${modelRuntimeStop ? " (turnkey llama.cpp running)" : ""}\n`);
    write(`  model        ${active ?? "(none — /setup)"}\n`);
    write(`  runtime      ${runtimePath ?? "(not fetched)"}\n`);
    write(`  provisioned  ${prov.ready ? "READY — offline-capable" : prov.detail}\n`);
    write(`  project      ${proj.name} (${proj.toolIds.length} tools)\n`);
    write(`  tool         ${maker.running ? `running → ${maker.running.url}` : "(none yet)"}\n`);
    write(`  goal         ${maker.brief.goal || "(not set)"}\n`);
  }
  async function cmdClear(): Promise<void> {
    maker.clearConversation();
    write("\x1b[2J\x1b[H"); // clear screen + home
    write("Cleared the conversation (fresh context). Your tool, Brief, and memory are untouched.\n");
  }
  async function cmdCompact(): Promise<void> {
    const turns = maker.conversation.length;
    maker.clearConversation();
    write(`\n✓ Compacted: dropped ${turns} transcript message(s) to free the model's context.\n  Kept: your running tool, the Brief (decisions/checks), and memory.\n`);
  }
  async function cmdExport(arg: string): Promise<void> {
    const dest = arg.trim() ? resolveDir(arg) : path.join(os.homedir(), "Downloads", "maker-conversation.md");
    const destDir = path.dirname(dest);
    if (!(await isGranted(store, destDir))) {
      write(`\n🔒 ${destDir} isn't permitted.\n  Allow it:  /allow ${destDir}\n  then run:  /export ${arg.trim()}\n`);
      return;
    }
    const md = maker.conversation
      .filter((m) => m.role !== "system")
      .map((m) => `**${m.role}:**\n\n${m.content}`)
      .join("\n\n---\n\n");
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.writeFile(dest, `# Maker conversation\n\n${md || "(empty)"}\n`);
    write(`\n✓ Exported the conversation to ${dest}\n`);
  }
  async function cmdCost(): Promise<void> {
    const s = await getStats(store);
    write("\nCost: $0.00 — everything runs on your machine. No account, no subscription, no per-token billing.\n");
    write(`(Local usage so far: ${s.sessions} sessions · ${s.toolsBuilt} tools built · ~${s.tokens} tokens — see /stats.)\n`);
  }
  async function cmdMemoryCmd(): Promise<void> {
    const roles = await getRoles(store);
    const projects = await listProjects(store);
    const macros = await listMacros(store);
    const granted = await listGrantedPaths(store);
    const { prompts, tools } = await historyOverview(store);
    write("\nWhat Maker remembers (all local, in ~/.maker):\n");
    write(`  roles        ${roles.length ? roles.join(", ") : "(none — /role)"}\n`);
    write(`  projects     ${projects.length} (${projects.map((p) => p.name).join(", ") || "none"})\n`);
    write(`  tools        ${tools.length}\n`);
    write(`  macros       ${macros.length}${macros.length ? " (" + macros.map((m) => "/" + m.name).join(" ") + ")" : ""}\n`);
    write(`  requests     ${prompts.length} remembered (searchable via /search)\n`);
    write(`  permissions  ${granted.length} allowed folder(s) (see /permissions)\n`);
    write("Wipe everything with /reset yes.\n");
  }
  async function cmdPermissions(arg: string): Promise<void> {
    const [sub, ...rest] = arg.split(/\s+/);
    if (sub === "revoke" && rest.length) {
      const dir = resolveDir(rest.join(" "));
      await revokePath(store, dir);
      write(`\n✓ Revoked ${dir}. Maker will ask (or need /allow) before touching it again.\n`);
      return;
    }
    const granted = await listGrantedPaths(store);
    write("\nAllowed folders (read + write, incl. subfolders):\n");
    write(granted.length ? granted.map((g) => "  " + g).join("\n") + "\n" : "  (none)\n");
    write("\n/allow <folder> to grant · /permissions revoke <folder> to revoke\n");
  }
  async function cmdTodos(): Promise<void> {
    const b = maker.brief;
    write(`\nGoal: ${b.goal || "(not set)"}\n`);
    write("\nOpen questions:\n");
    write(b.open.length ? b.open.map((o) => "  ? " + o).join("\n") + "\n" : "  (none)\n");
    write("\nLabeled guesses (correct me by talking):\n");
    write(b.guesses.length ? b.guesses.map((g) => `  ~ ${g.text}`).join("\n") + "\n" : "  (none)\n");
    write(`\nDecided: ${b.decided.length} committed behavior(s) (the regression net).\n`);
  }
  async function cmdBug(): Promise<void> {
    const url = "https://github.com/bpupadhyaya/maker/issues/new";
    write(`\nReport a bug: ${url}\n(Opening in your browser…)\n`);
    openBrowser(url);
  }
  async function cmdVersion(): Promise<void> {
    write(`\nMaker v${await appVersion()} — 100% on-device, offline-capable, MIT.\n`);
  }
  async function cmdLogin(): Promise<void> {
    write("\nNo login needed — Maker has no accounts. It's 100% yours, on your device, offline.\n");
  }
  async function cmdResume(): Promise<void> {
    write("\nMaker resumes automatically: your tool, Brief, and memory persist in ~/.maker and were restored at launch.\n");
    write(maker.running ? `Your tool is running → ${maker.running.url}\n` : "No tool running yet — describe one to build it.\n");
  }

  // Command registry — drives the command map, /help, and tab-completion.
  const REGISTRY: [name: string, args: string, desc: string, fn: (arg: string) => Promise<void> | void][] = [
    ["/help", "", "list all commands", async () => { await cmdHelp(); }],
    ["/setup", "", "download your model + runtime (the one online step)", setup],
    ["/models", "", "list installed + available models", cmdModels],
    ["/use", "<id>", "switch the active model", cmdUse],
    ["/remove", "<id>", "remove a model to free space", cmdRemove],
    ["/remove-all", "", "remove all models", cmdRemoveAll],
    ["/reset", "[yes]", "wipe ALL data (models, tools, memory)", cmdReset],
    ["/doctor", "[full]", "readiness check (full = really download the runtime)", cmdDoctor],
    ["/tools", "", "list your tools", async () => { await cmdTools(); }],
    ["/open", "<id>", "reopen a tool (continue iterating)", cmdOpen],
    ["/new", "", "start a fresh tool", async () => { await cmdNew(); }],
    ["/undo", "", "rewind the last change to your tool", async () => { await cmdUndo(); }],
    ["/status", "", "model, runtime, project, tool, goal", async () => { await cmdStatus(); }],
    ["/version", "", "version info", async () => { await cmdVersion(); }],
    ["/clear", "", "clear screen + drop the chat transcript", async () => { await cmdClear(); }],
    ["/compact", "", "free the model's context (keeps tool + Brief)", async () => { await cmdCompact(); }],
    ["/export", "[file]", "export the conversation to a markdown file", cmdExport],
    ["/cost", "", "what this costs ($0 — it's local)", async () => { await cmdCost(); }],
    ["/memory", "", "what Maker remembers about you", async () => { await cmdMemoryCmd(); }],
    ["/permissions", "[revoke <dir>]", "list/revoke allowed folders", cmdPermissions],
    ["/allow", "<folder>", "allow Maker to read/write a folder", cmdAllow],
    ["/save", "[folder]", "save the current tool's files to a folder", cmdSave],
    ["/read", "<folder>", "read + analyze a local folder", cmdRead],
    ["/image", "<path>", "attach an image to your next message (vision)", cmdImage],
    ["/todos", "", "the Brief's open questions + guesses", async () => { await cmdTodos(); }],
    ["/role", "[ids…]", "what you make things for (personalizes starters)", cmdRole],
    ["/starters", "", "list quick-start templates", async () => { await cmdStarters(); }],
    ["/starter", "<id>", "build a starter template", cmdStarter],
    ["/project", "[new|use …]", "projects: list, create, switch", cmdProject],
    ["/macro", "[add|remove …]", "custom /commands (shortcuts)", cmdMacro],
    ["/schedule", "[add|remove …]", "run a prompt on a cadence (offline routines)", cmdSchedule],
    ["/hook", "[add|remove …]", "run a command on events (tool-built, …)", cmdHook],
    ["/history", "", "recent requests + built tools", async () => { await cmdHistory(); }],
    ["/search", "<query>", "search your requests + tools", cmdSearch],
    ["/settings", "", "show settings", async () => { await cmdSettings(); }],
    ["/set", "<key> <value>", "change a setting (model/effort/theme/approvalMode)", cmdSet],
    ["/stats", "", "local usage stats (private)", async () => { await cmdStats(); }],
    ["/resume", "", "how resuming works (it's automatic)", async () => { await cmdResume(); }],
    ["/bug", "", "report a bug (opens GitHub issues)", async () => { await cmdBug(); }],
    ["/login", "", "no accounts — Maker is yours", async () => { await cmdLogin(); }],
    ["/logout", "", "no accounts — nothing to log out of", async () => { await cmdLogin(); }],
    ["/exit", "", "quit (also /quit)", () => { /* handled by the controller */ }],
  ];
  async function cmdHelp(): Promise<void> {
    write("\nMaker commands:\n");
    for (const [name, args, desc] of REGISTRY) {
      write(`  ${(name + (args ? " " + args : "")).padEnd(28)} ${desc}\n`);
    }
    const macros = await listMacros(store);
    if (macros.length) write("\nYour macros: " + macros.map((m) => "/" + m.name).join(" ") + "\n");
    write("\nAnything else you type = a request to build/iterate your tool. Tab completes /commands.\n");
  }
  const commandMap: Record<string, (arg: string) => Promise<void> | void> = {};
  for (const [name, , , fn] of REGISTRY) commandMap[name] = fn;

  // Create the readline interface only now — after all async setup — so piped
  // input isn't emitted and lost before we start consuming it. Tab completes
  // /commands (like Claude CLI's slash menu).
  const commandNames = REGISTRY.map(([n]) => n);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string): [string[], string] => {
      if (!line.startsWith("/")) return [[], line];
      const hits = commandNames.filter((c) => c.startsWith(line));
      return [hits.length ? hits : commandNames, line];
    },
  });
  const io = { input: rl, write };
  await runMakerConversation(maker, io, {
    prompt: "\n» ",
    commands: commandMap,
    resolveMacro: (name) => resolveMacro(store, name),
    // Natural-language file ops go to the REAL permission-gated commands, not the
    // model (small models just hallucinate "it's saved in Downloads").
    intercept: async (line) => {
      const save = /^\s*(?:please\s+)?save\b(?:\s+(?:the\s+)?(?:project|tool|it|this|files?))?(?:\s+(?:in|to|into|at)\s+(.+?))?\s*$/i.exec(line);
      if (save) {
        // Strip natural-language noise from the path ("~Downloads folder" → the
        // word "folder" isn't part of it) and articles ("the Downloads folder").
        const base = (save[1] ?? "~/Downloads")
          .trim()
          .replace(/^(?:the|my)\s+/i, "")
          .replace(/\s+(?:folder|directory|dir)\s*$/i, "")
          .replace(/\/+$/, "");
        const goal = maker.brief.goal
          .toLowerCase()
          .replace(/^(?:please\s+)?(?:build|make|create)(?:\s+me)?(?:\s+an?)?\s+/i, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40)
          .replace(/-$/, "");
        await cmdSave(`${base}/${goal || "my-tool"}`);
        return true;
      }
      const readCmd = /^\s*(?:please\s+)?(?:can you\s+)?(?:read|analy[sz]e|review|summari[sz]e|inspect|explain|look (?:at|through)|go through)\b/i.test(line);
      const pathTok = line.match(/(?:^|\s)(~[^\s]+|\/[^\s]+)/);
      if (readCmd && pathTok) {
        await cmdRead(pathTok[1] ?? "");
        return true;
      }
      return false;
    },
    needsApproval: async () => (await getSettings(store)).approvalMode === "ask",
    onRequest: (line) => {
      void recordPrompt(store, line);
      void recordTokens(store, Math.ceil(line.length / 4));
    },
    onEvent,
  }, () => {
    const imgs = pendingImages;
    pendingImages = [];
    return imgs;
  });
  scheduleRunner.stop();
  watcher.stop();
  modelRuntimeStop?.();
  await maker.stop();
  rl.close();
}

// Auto-run only when invoked directly (not when imported by tests/index).
const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
