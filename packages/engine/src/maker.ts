import type { InferenceBackend } from "./interfaces/inference.ts";
import type { ToolRuntime, RunningTool } from "./interfaces/tool-runtime.ts";
import type { MemoryStore } from "./interfaces/memory.ts";
import type { Brief } from "./interfaces/brief.ts";
import { emptyBrief } from "./interfaces/brief.ts";
import type { MakerEvent } from "./events.ts";
import type { TasteMemory } from "./taste-memory.ts";
import { createSession } from "./session.ts";
import { synthesizeFiles, MAKER_SYSTEM_PROMPT } from "./synthesizer.ts";
import { parseBriefBlock, mergeBrief } from "./brief-manager.ts";
import { detectGaps } from "./gap-detection.ts";
import {
  smokeCheck,
  parseChecksBlock,
  runChecks,
  reportViolations,
} from "./verification.ts";
import type { Check } from "./verification.ts";
import { slugName, renderReadme, buildManifest } from "./handoff.ts";
import type { HandoffData } from "./handoff.ts";
import type { ToolExport } from "./tool-export.ts";
import { parseContractBlock, deriveContract } from "./contract.ts";
import type { ToolContract, ToolRegistry } from "./contract.ts";
import {
  matchTools,
  snapshotDependency,
  verifyDependencies,
} from "./composition.ts";
import type { DependencySnapshot } from "./composition.ts";

export interface MakerDeps {
  readonly inference: InferenceBackend;
  readonly runtime: ToolRuntime;
  readonly toolId?: string;
  /** Optional local persistence; when present, Brief + tool survive restarts. */
  readonly store?: MemoryStore;
  /** Optional taste-memory; when present, decisions shrink gap-detection. */
  readonly taste?: TasteMemory;
  /** Optional tool registry; when present, each built tool registers its contract. */
  readonly registry?: ToolRegistry;
  /** Called after a tool is (re)built — e.g. to file it under the active project. */
  readonly onToolBuilt?: (toolId: string) => Promise<void> | void;
}

export interface Maker {
  /** One turn of the spiral: clarify → build → run → verify. Called again = iterate.
   *  `opts.images` (base64 data URIs) attaches images for vision models. */
  express(request: string, opts?: { images?: readonly string[] }): AsyncIterable<MakerEvent>;
  readonly running: RunningTool | undefined;
  readonly brief: Brief;
  /** Record a ratified decision (also stored in taste-memory, if present). */
  decide(gapId: string, value: string): Promise<void>;
  /** A ready-to-write ejectable bundle (name + files + README + manifest). */
  handoffBundle(): HandoffData;
  /** A portable, JSON-serializable export (files + Brief + checks + contract). */
  exportBundle(): ToolExport;
  /** The tool's contract (what it provides to other tools), once built. */
  readonly contract: ToolContract | undefined;
  /** Accept a reuse offer — records the dependency for cross-tool verification. */
  reuse(contract: ToolContract): void;
  /** Ids of tools this one composes/depends on. */
  readonly dependencies: readonly string[];
  /** Check composed dependencies against the live registry; concrete breaks. */
  verifyComposition(): Promise<string[]>;
  restore(): Promise<boolean>;
  stop(): Promise<void>;
  /** The conversation so far (for /export, /status). */
  readonly conversation: readonly { role: string; content: string }[];
  /** Drop the chat transcript (fresh context); the Brief, tool, and checks stay. */
  clearConversation(): void;
}

/**
 * The v1 Maker: the full spiral with the collaborator behaviors wired in —
 * gap-detection (ask the few questions that matter), verification (checks run
 * each ring), taste-memory (decisions shrink future questions), and hand-off.
 * Still headless: every dependency is an interface.
 */
export function createMaker(deps: MakerDeps): Maker {
  const toolId = deps.toolId ?? "tool";
  let session = createSession({
    inference: deps.inference,
    systemPrompt: MAKER_SYSTEM_PROMPT,
  });

  let current: RunningTool | undefined;
  let brief: Brief = emptyBrief();
  let lastFiles: Record<string, string> | undefined;
  let gapsChecked = false;
  let contract: ToolContract | undefined;
  const dependencies: string[] = [];
  const depSnapshots: DependencySnapshot[] = [];
  const checks: Check[] = [smokeCheck()]; // the accumulating regression net

  const briefKey = `${toolId}:brief`;
  const filesKey = `${toolId}:files`;

  async function persist(): Promise<void> {
    if (!deps.store) return;
    await deps.store.set(briefKey, brief);
    if (lastFiles) await deps.store.set(filesKey, lastFiles);
  }

  function addChecks(more: readonly Check[]): void {
    const seen = new Set(checks.map((c) => c.id));
    for (const c of more) if (!seen.has(c.id)) checks.push(c);
  }

  async function* express(
    request: string,
    opts?: { images?: readonly string[] },
  ): AsyncIterable<MakerEvent> {
    // Understand: on the first turn, detect the gaps worth asking about.
    if (!gapsChecked) {
      gapsChecked = true;
      const known = deps.taste ? await deps.taste.knownGapIds() : [];
      const gaps = detectGaps(request, { known });
      if (gaps.guesses.length > 0) {
        brief = mergeBrief(brief, { guesses: [...brief.guesses, ...gaps.guesses] });
      }
      if (gaps.clarifiers.length > 0) {
        yield { type: "clarify", clarifiers: gaps.clarifiers };
      }

      // Proactively offer reuse of an existing tool that matches (never presumed).
      if (deps.registry) {
        const others = (await deps.registry.list()).filter((c) => c.id !== toolId);
        const matches = matchTools(request, others);
        if (matches.length > 0) yield { type: "reuse-offer", matches };
      }
    }

    // Build: ask the model, stream its reply.
    let assembled = "";
    let errored = false;
    for await (const ev of session.send(request, opts?.images ? { images: opts.images } : undefined)) {
      if (ev.type === "assistant-done") assembled = ev.text;
      if (ev.type === "error") errored = true;
      yield ev;
    }
    if (errored) return;

    // Update the Brief.
    const patch = parseBriefBlock(assembled) ?? {};
    if (patch.goal === undefined && brief.goal === "") patch.goal = request;
    if (Object.keys(patch).length > 0) {
      brief = mergeBrief(brief, patch);
      yield { type: "brief-updated", brief };
    }

    // Only real content counts — drop blank files. A build with no non-empty
    // index.html would WIPE the current tool (the runtime clears the dir first),
    // so in that case keep the last good tool instead of destroying it.
    const files = synthesizeFiles(assembled);
    const meaningful = Object.fromEntries(
      Object.entries(files).filter(([, v]) => v.trim().length > 0),
    );
    if (!meaningful["index.html"]) {
      await persist();
      return;
    }

    // Build the new tool before tearing down the old (always-runnable).
    const built = await deps.runtime.build({ id: toolId, files: meaningful });
    const next = await deps.runtime.run(built);
    if (current) await current.stop();
    current = next;
    lastFiles = files;
    yield { type: "tool-running", url: current.url };

    // Verify: run the accumulated checks against the running tool.
    addChecks(parseChecksBlock(assembled));
    const results = await runChecks(current.url, checks);
    const violations = reportViolations(results);
    yield { type: "checks-run", results, violations };

    // Contract: derive + register what this tool provides to other tools.
    contract = deriveContract(
      toolId,
      brief,
      slugName(brief.goal),
      parseContractBlock(assembled),
    );
    if (deps.registry) await deps.registry.register(contract);
    if (deps.onToolBuilt) await deps.onToolBuilt(toolId);

    await persist();
  }

  async function decide(gapId: string, value: string): Promise<void> {
    if (deps.taste) await deps.taste.recordDecision(gapId, value);
    brief = mergeBrief(brief, { decided: [...brief.decided, `${gapId}: ${value}`] });
  }

  function handoffBundle(): HandoffData {
    const name = slugName(brief.goal);
    return {
      name,
      files: lastFiles ?? {},
      readme: renderReadme(name, brief, checks),
      manifest: buildManifest(name, brief, checks),
    };
  }

  function exportBundle(): ToolExport {
    return {
      name: slugName(brief.goal),
      files: lastFiles ?? {},
      brief,
      checks: [...checks],
      contract,
    };
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
    get conversation() {
      return session.history;
    },
    clearConversation() {
      session = createSession({
        inference: deps.inference,
        systemPrompt: MAKER_SYSTEM_PROMPT,
      });
    },
    decide,
    handoffBundle,
    exportBundle,
    get contract() {
      return contract;
    },
    reuse(dep: ToolContract) {
      if (!dependencies.includes(dep.id)) {
        dependencies.push(dep.id);
        depSnapshots.push(snapshotDependency(dep));
      }
      brief = mergeBrief(brief, {
        decided: [...brief.decided, `composes: ${dep.name}`],
      });
    },
    get dependencies() {
      return dependencies;
    },
    async verifyComposition() {
      if (!deps.registry) return [];
      return verifyDependencies(depSnapshots, await deps.registry.list());
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
