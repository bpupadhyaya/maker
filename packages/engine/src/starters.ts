/**
 * Quick-start templates (H5.2) — the offline answer to Codex's suggested tasks
 * ("Review a PRD…"), but for building tools: "build a tracker / a form / …".
 * Ordered per the user's role (startersForRoles) so the empty state feels
 * personal. Each starter is just a ready-made prompt.
 */
export interface Starter {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
}

export const STARTERS: readonly Starter[] = [
  { id: "tracker", label: "A tracker", prompt: "build me a habit tracker I can check off each day" },
  { id: "list", label: "A list", prompt: "build me a simple to-do list I can add to and check off" },
  { id: "timer", label: "A timer", prompt: "build me a countdown timer" },
  { id: "calculator", label: "A calculator", prompt: "build me a tip calculator" },
  { id: "dashboard", label: "A dashboard", prompt: "build me a small dashboard showing a few numbers and a chart" },
  { id: "form", label: "A form", prompt: "build me a contact form that saves entries locally" },
];

export function starterById(id: string): Starter | undefined {
  return STARTERS.find((s) => s.id === id);
}

/** Full starter list ordered by the given ids (rest appended). */
export function orderedStarters(starterIds: readonly string[]): Starter[] {
  const out: Starter[] = [];
  for (const id of starterIds) {
    const s = starterById(id);
    if (s && !out.includes(s)) out.push(s);
  }
  for (const s of STARTERS) if (!out.includes(s)) out.push(s);
  return out;
}
