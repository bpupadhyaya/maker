import type { InferenceBackend } from "./interfaces/inference.ts";
import type { ToolRuntime, RunningTool } from "./interfaces/tool-runtime.ts";
import type { MemoryStore } from "./interfaces/memory.ts";
import type { Brief } from "./interfaces/brief.ts";
import { emptyBrief } from "./interfaces/brief.ts";
import type { MakerEvent } from "./events.ts";
import { createSession } from "./session.ts";
import { synthesizeFiles, MAKER_SYSTEM_PROMPT } from "./synthesizer.ts";
import { parseBriefBlock, mergeBrief } from "./brief-manager.ts";

export interface MakerDeps {
  readonly inference: InferenceBackend;
  readonly runtime: ToolRuntime;
  /** Stable id for the single tool this Maker builds (M0.5 = one tool). */
  readonly toolId?: string;
  /** Optional local persistence; when present, the Brief + tool survive restarts. */
  readonly store?: MemoryStore;
}

export interface Maker {
  /**
   * One turn of the spiral: express a request, and if the model produces tool
   * files, (re)build and run them. Streams the model's events, then a final
   * `tool-running` event with the pokeable URL. Called again = iterate.
   */
  express(request: string): AsyncIterable<MakerEvent>;
  /** The currently running tool, if any. */
  readonly running: RunningTool | undefined;
  /** Maker's living understanding — the Brief. */
  readonly brief: Brief;
  /**
   * Reload the Brief + last tool from the store (if any) and rebuild+run the
   * tool. Returns whether anything was restored. The "Evolve" seed: return
   * later and everything is still here.
   */
  restore(): Promise<boolean>;
  stop(): Promise<void>;
}

/**
 * The M0.5 orchestrator — the smallest complete spiral: converse → build the
 * smallest runnable tool → it runs → converse again → rebuild → still runs.
 * Wires the (interface-typed) inference backend, a session for memory-of-turn,
 * the synthesizer, and the tool runtime. Nothing here knows a concrete backend
 * or OS.
 */
export function createMaker(deps: MakerDeps): Maker {
  const toolId = deps.toolId ?? "tool";
  const session = createSession({
    inference: deps.inference,
    systemPrompt: MAKER_SYSTEM_PROMPT,
  });
  let current: RunningTool | undefined;
  let brief: Brief = emptyBrief();
  let lastFiles: Record<string, string> | undefined;

  const briefKey = `${toolId}:brief`;
  const filesKey = `${toolId}:files`;

  async function persist(): Promise<void> {
    if (!deps.store) return;
    await deps.store.set(briefKey, brief);
    if (lastFiles) await deps.store.set(filesKey, lastFiles);
  }

  async function* express(request: string): AsyncIterable<MakerEvent> {
    let assembled = "";
    let errored = false;

    for await (const ev of session.send(request)) {
      if (ev.type === "assistant-done") assembled = ev.text;
      if (ev.type === "error") errored = true;
      yield ev;
    }
    if (errored) return;

    // Update the Brief: apply any model-emitted brief block; seed the goal from
    // the first request if still unset.
    const patch = parseBriefBlock(assembled) ?? {};
    if (patch.goal === undefined && brief.goal === "") patch.goal = request;
    if (Object.keys(patch).length > 0) {
      brief = mergeBrief(brief, patch);
      yield { type: "brief-updated", brief };
    }

    const files = synthesizeFiles(assembled);
    if (Object.keys(files).length === 0) {
      await persist(); // a plain conversational turn may still have moved the Brief
      return;
    }

    // Always-runnable: tear down the previous tool only once the new one is ready
    // to replace it, so a failed rebuild never leaves the user with nothing.
    const built = await deps.runtime.build({ id: toolId, files });
    const next = await deps.runtime.run(built);
    if (current) await current.stop();
    current = next;
    lastFiles = files;
    await persist();

    yield { type: "tool-running", url: current.url };
  }

  async function restore(): Promise<boolean> {
    if (!deps.store) return false;
    const savedBrief = await deps.store.get<Brief>(briefKey);
    const savedFiles = await deps.store.get<Record<string, string>>(filesKey);
    if (savedBrief) brief = savedBrief;
    if (savedFiles && Object.keys(savedFiles).length > 0) {
      lastFiles = savedFiles;
      const built = await deps.runtime.build({ id: toolId, files: savedFiles });
      current = await deps.runtime.run(built);
    }
    return Boolean(savedBrief) || current !== undefined;
  }

  return {
    express,
    get running() {
      return current;
    },
    get brief() {
      return brief;
    },
    restore,
    async stop() {
      if (current) {
        await current.stop();
        current = undefined;
      }
    },
  };
}
