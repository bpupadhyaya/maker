import type { ToolContract } from "./contract.ts";

/**
 * Composition matching (DESIGN.md -> "Reuse is proactive — offered, never
 * presumed"). When a new request overlaps an existing tool's contract, Maker
 * surfaces it as an offer the user confirms — the decided proactivity behavior
 * aimed at reuse. Silent reuse of the wrong tool would be a costly wrong
 * assumption, so this only *offers*.
 */

export interface ReuseMatch {
  readonly contract: ToolContract;
  readonly score: number;
  readonly why: string;
}

export interface MatchOptions {
  readonly minScore?: number;
}

const STOP = new Set([
  "a", "an", "the", "me", "my", "build", "make", "create", "for", "to", "of",
  "and", "with", "that", "some", "please", "tool", "app", "want", "need", "new",
]);

/** Lowercase content words, lightly stemmed (trailing s), length > 2. */
function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (raw.length <= 2 || STOP.has(raw)) continue;
    out.add(raw.length > 3 ? raw.replace(/s$/, "") : raw);
  }
  return out;
}

/** Rank registered tools by token overlap with the request. */
export function matchTools(
  request: string,
  contracts: readonly ToolContract[],
  opts: MatchOptions = {},
): ReuseMatch[] {
  const min = opts.minScore ?? 1;
  const reqTokens = tokens(request);

  const matches: ReuseMatch[] = [];
  for (const c of contracts) {
    const bag = tokens(
      `${c.name} ${c.goal} ${c.provides.map((p) => `${p.name} ${p.description}`).join(" ")}`,
    );
    let score = 0;
    for (const t of reqTokens) if (bag.has(t)) score += 1;
    if (score >= min) {
      matches.push({
        contract: c,
        score,
        why: `builds on "${c.name}" (provides ${c.provides.map((p) => p.name).join(", ")})`,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

/** What a composed tool relied on from a dependency, captured at reuse time. */
export interface DependencySnapshot {
  readonly id: string;
  readonly name: string;
  readonly provides: readonly string[];
}

export function snapshotDependency(c: ToolContract): DependencySnapshot {
  return { id: c.id, name: c.name, provides: c.provides.map((p) => p.name) };
}

/**
 * Cross-tool verification: compare the snapshots a tool depends on against the
 * live contracts. A dependency that vanished, or that dropped a provision the
 * dependent relied on, is reported as a concrete break — the regression net and
 * contradiction-catching extending across tools, not just rings.
 */
export function verifyDependencies(
  snapshots: readonly DependencySnapshot[],
  current: readonly ToolContract[],
): string[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  const violations: string[] = [];
  for (const s of snapshots) {
    const c = byId.get(s.id);
    if (!c) {
      violations.push(`✗ dependency "${s.name}" (${s.id}) no longer exists`);
      continue;
    }
    const names = new Set(c.provides.map((p) => p.name));
    for (const p of s.provides) {
      if (!names.has(p)) {
        violations.push(
          `✗ "${c.name}" no longer provides "${p}" — a composed tool relies on it`,
        );
      }
    }
  }
  return violations;
}
