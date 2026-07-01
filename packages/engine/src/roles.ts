/**
 * Roles (H5.1) — a first-run "What do you make things for?" tuned to Maker's
 * everyone audience (not just engineers). The chosen role(s) personalize the
 * experience offline: which starter templates to surface, which gap-detection
 * tool-kinds to emphasize, and taste defaults. Purely local; nothing is gated.
 */
export interface Role {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  /** Gap-detection tool-kinds to emphasize for this role. */
  readonly kinds: readonly string[];
  /** Starter template ids to surface first (see quick-starts, H5.2). */
  readonly starters: readonly string[];
}

export const ROLES: readonly Role[] = [
  { id: "personal", label: "Personal", blurb: "everyday life", kinds: ["list", "timer"], starters: ["tracker", "list", "timer"] },
  { id: "money", label: "Money & Finance", blurb: "budgets, expenses", kinds: ["money"], starters: ["calculator", "tracker", "dashboard"] },
  { id: "health", label: "Health", blurb: "habits, fitness", kinds: ["timer", "list"], starters: ["tracker", "timer", "list"] },
  { id: "learning", label: "Learning / Student", blurb: "study, notes", kinds: ["list", "form"], starters: ["list", "timer", "form"] },
  { id: "work", label: "Work / Business", blurb: "tasks, ops", kinds: ["list", "form"], starters: ["tracker", "form", "dashboard"] },
  { id: "creative", label: "Creative", blurb: "projects, ideas", kinds: ["list"], starters: ["list", "dashboard"] },
  { id: "home", label: "Home", blurb: "chores, shopping", kinds: ["list"], starters: ["list", "tracker"] },
  { id: "other", label: "Other", blurb: "anything", kinds: [], starters: ["list", "form", "timer", "calculator", "dashboard", "tracker"] },
];

const ALL_STARTERS = ["list", "form", "timer", "calculator", "dashboard", "tracker"];

export function roleById(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id);
}

/** Ordered starter ids for the chosen roles (most-emphasized first). */
export function startersForRoles(roleIds: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of roleIds) {
    const r = roleById(id);
    if (r) for (const s of r.starters) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return [...ALL_STARTERS];
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  // append any starters not covered, so the full set is always available
  for (const s of ALL_STARTERS) if (!ranked.includes(s)) ranked.push(s);
  return ranked;
}

/** Union of emphasized tool-kinds for the chosen roles. */
export function kindsForRoles(roleIds: readonly string[]): string[] {
  const set = new Set<string>();
  for (const id of roleIds) {
    const r = roleById(id);
    if (r) for (const k of r.kinds) set.add(k);
  }
  return [...set];
}
