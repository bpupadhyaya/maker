import type { Guess } from "./interfaces/brief.ts";

/**
 * Gap-detection v1 (DESIGN.md -> "Gap-detection"). A ranking, not an
 * enumeration: score each unknown by cost-of-being-wrong and visibility, then
 * **ask only the top few** (invisible/expensive) as propose-a-default clarifiers
 * and **guess-and-label the rest** (visible/cheap — safe because the tool is
 * always-runnable). Powered by retrieved archetype checklists per tool-kind, not
 * raw model intuition, so a small local model can lean on it.
 */

export type ToolKind = "list" | "money" | "timer" | "form" | "generic";

export interface Gap {
  readonly id: string;
  readonly question: string;
  readonly proposedDefault: string;
  /** Would a wrong guess be obvious by poking the running tool? */
  readonly visibility: "visible" | "invisible";
  /** How costly is getting it wrong? */
  readonly cost: "low" | "high";
}

/** A batched, propose-a-default question — a question and a guess fused. */
export interface Clarifier {
  readonly id: string;
  readonly prompt: string;
  readonly proposedDefault: string;
}

export interface GapResult {
  readonly kind: ToolKind;
  readonly clarifiers: readonly Clarifier[];
  readonly guesses: readonly Guess[];
}

export interface GapOptions {
  /** Max clarifiers to ask in one turn (restraint; the rest become guesses). */
  readonly maxAsk?: number;
  /** Gap ids already decided/known (memory shrinks the question set over time). */
  readonly known?: readonly string[];
}

const ARCHETYPES: Readonly<Record<ToolKind, readonly Gap[]>> = {
  list: [
    { id: "list.persist", question: "Should items persist after closing?", proposedDefault: "yes, saved locally", visibility: "invisible", cost: "high" },
    { id: "list.duplicates", question: "Allow duplicate items?", proposedDefault: "yes", visibility: "invisible", cost: "low" },
    { id: "list.sort", question: "Sort order?", proposedDefault: "newest first", visibility: "visible", cost: "low" },
    { id: "list.empty", question: "What to show when empty?", proposedDefault: "a friendly hint", visibility: "visible", cost: "low" },
  ],
  money: [
    { id: "money.currency", question: "Which currency?", proposedDefault: "USD", visibility: "invisible", cost: "high" },
    { id: "money.rounding", question: "Round to cents?", proposedDefault: "yes, 2 decimals", visibility: "invisible", cost: "high" },
    { id: "money.tax", question: "Include tax?", proposedDefault: "no", visibility: "invisible", cost: "high" },
  ],
  timer: [
    { id: "timer.direction", question: "Count up or down?", proposedDefault: "up", visibility: "visible", cost: "low" },
    { id: "timer.max", question: "Maximum time?", proposedDefault: "none", visibility: "invisible", cost: "high" },
    { id: "timer.sound", question: "Play a sound at zero?", proposedDefault: "no", visibility: "invisible", cost: "low" },
  ],
  form: [
    { id: "form.fields", question: "Which fields?", proposedDefault: "name + email", visibility: "invisible", cost: "high" },
    { id: "form.submit", question: "What happens on submit?", proposedDefault: "save locally", visibility: "invisible", cost: "high" },
    { id: "form.validate", question: "Require a valid email?", proposedDefault: "yes", visibility: "invisible", cost: "high" },
  ],
  generic: [
    { id: "generic.persist", question: "Should its data persist after closing?", proposedDefault: "yes, saved locally", visibility: "invisible", cost: "high" },
  ],
};

/** Heuristic tool-kind classifier (a small, corpus-friendly stand-in). */
export function classifyKind(request: string): ToolKind {
  const r = request.toLowerCase();
  if (/\b(tip|budget|invoice|price|cost|money|currency|expense|salary|tax|discount|payment)\b/.test(r)) return "money";
  if (/\b(timer|stopwatch|countdown|clock|pomodoro|alarm)\b/.test(r)) return "timer";
  if (/\b(list|todo|to-do|task|tracker|checklist|inventory|note|notes)\b/.test(r)) return "list";
  if (/\b(form|survey|signup|sign-up|register|contact|feedback|questionnaire)\b/.test(r)) return "form";
  return "generic";
}

function priority(g: Gap): number {
  return (g.cost === "high" ? 2 : 0) + (g.visibility === "invisible" ? 1 : 0);
}

function toClarifier(g: Gap): Clarifier {
  return {
    id: g.id,
    proposedDefault: g.proposedDefault,
    prompt: `${g.question} I'll assume ${g.proposedDefault} — right, or something else?`,
  };
}

function toGuess(g: Gap): Guess {
  return { text: `${g.question} → ${g.proposedDefault}`, rationale: "assumed; change anytime" };
}

/**
 * Decide what to ask vs. guess for a request. Invisible/expensive gaps become
 * batched clarifiers (bounded by maxAsk); visible/cheap ones (and any overflow)
 * become labeled guesses.
 */
export function detectGaps(request: string, opts: GapOptions = {}): GapResult {
  const kind = classifyKind(request);
  const maxAsk = opts.maxAsk ?? 3;
  const known = new Set(opts.known ?? []);

  const gaps = ARCHETYPES[kind].filter((g) => !known.has(g.id));
  const ranked = [...gaps].sort((a, b) => priority(b) - priority(a));

  const clarifiers: Clarifier[] = [];
  const guesses: Guess[] = [];
  for (const g of ranked) {
    const worthAsking = g.cost === "high" || g.visibility === "invisible";
    if (worthAsking && clarifiers.length < maxAsk) clarifiers.push(toClarifier(g));
    else guesses.push(toGuess(g));
  }

  return { kind, clarifiers, guesses };
}
