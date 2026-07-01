import * as readline from "node:readline";
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
import { fileMemoryStore, tasteMemory, getRoles, setRoles } from "../../store/src/index.ts";
import { ROLES, roleById, STARTERS, starterById, orderedStarters, startersForRoles } from "../../engine/src/index.ts";
import { renderEvent } from "./render.ts";
import {
  provisionModel,
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
  const inference = makeInference(backendName, activeEntry?.ollama);

  const store = fileMemoryStore();
  const maker = createMaker({
    inference,
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
  });
  await maker.restore();

  const write = (text: string): void => {
    process.stdout.write(text);
  };

  process.stdout.write(
    `Maker — terminal (v1), backend=${backendName}. Describe a tool; /setup to install your model; /exit to quit.\n`,
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

  // First-run: if the model isn't set up yet, guide (don't demand shell commands).
  if (!(await installer.isInstalled(model))) {
    write(
      `\nHeads up: your local model (${model.name}) isn't set up yet. ` +
        `Type /setup and Maker will get it for you (via ${kind}, runtime ${runtimeKind}; one step, needs internet once).\n`,
    );
  }

  // /setup — app-driven provisioning. The user triggers it; the app does the rest.
  async function setup(): Promise<void> {
    write(`\nSetting up your model (via ${kind}, runtime ${runtimeKind})…\n`);
    const result = await provisionModel({
      installer,
      hardware: hw,
      onProgress: (p) => {
        const pct = p.ratio !== undefined ? ` ${Math.round(p.ratio * 100)}%` : "";
        write(`  ${p.message}${pct}\n`);
      },
    });
    write(result.ok ? "\n✓ Setup complete.\n" : `\n✗ ${result.detail}\n`);
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
    write(`\nActive model set to ${arg}. Restart Maker to use it.\n`);
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
    }
  };

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

  // Create the readline interface only now — after all async setup — so piped
  // input isn't emitted and lost before we start consuming it.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const io = { input: rl, write };
  await runMakerConversation(maker, io, {
    prompt: "\n» ",
    commands: {
      "/setup": setup,
      "/models": cmdModels,
      "/use": cmdUse,
      "/remove": cmdRemove,
      "/remove-all": cmdRemoveAll,
      "/reset": cmdReset,
      "/role": cmdRole,
      "/starters": cmdStarters,
      "/starter": cmdStarter,
    },
    onEvent,
  });
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
