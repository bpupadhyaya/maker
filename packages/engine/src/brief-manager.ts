import type { Brief, Guess } from "./interfaces/brief.ts";

/**
 * M0.6 Brief maintenance. The Brief is the one exposed structure — here it is
 * maintained from the conversation: the model may emit a reserved ```brief```
 * JSON block, which is parsed and merged; the goal seeds from the first request
 * if unset. This is the plain-language projection (see DESIGN.md -> "The Brief").
 */

/** Parse a ```brief``` JSON block into a partial Brief, if present and valid. */
export function parseBriefBlock(modelText: string): Partial<Brief> | undefined {
  const m = /```brief[^\n]*\n([\s\S]*?)```/.exec(modelText);
  if (!m) return undefined;
  try {
    const obj: unknown = JSON.parse(m[1] ?? "");
    if (typeof obj !== "object" || obj === null) return undefined;
    const raw = obj as Record<string, unknown>;
    const patch: Partial<Brief> = {};

    if (typeof raw["goal"] === "string") patch.goal = raw["goal"];
    if (Array.isArray(raw["decided"])) {
      patch.decided = raw["decided"].filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(raw["open"])) {
      patch.open = raw["open"].filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(raw["guesses"])) {
      const gs: Guess[] = [];
      for (const g of raw["guesses"]) {
        if (typeof g === "string") {
          gs.push({ text: g });
        } else if (g !== null && typeof g === "object") {
          const go = g as Record<string, unknown>;
          if (typeof go["text"] === "string") {
            gs.push(
              typeof go["rationale"] === "string"
                ? { text: go["text"], rationale: go["rationale"] }
                : { text: go["text"] },
            );
          }
        }
      }
      patch.guesses = gs;
    }
    return patch;
  } catch {
    return undefined;
  }
}

/** Merge a patch onto the current Brief; provided fields replace, others persist. */
export function mergeBrief(current: Brief, patch: Partial<Brief>): Brief {
  return {
    goal: patch.goal ?? current.goal,
    decided: patch.decided ?? current.decided,
    guesses: patch.guesses ?? current.guesses,
    open: patch.open ?? current.open,
  };
}

/** Plain-language projection of the Brief for a terminal/glanceable surface. */
export function renderBrief(b: Brief): string {
  const lines: string[] = [];
  lines.push(`  Goal:    ${b.goal || "(not set yet)"}`);
  lines.push(
    b.decided.length
      ? `  Decided:${b.decided.map((d) => `\n    - ${d}`).join("")}`
      : "  Decided: (nothing yet)",
  );
  if (b.guesses.length) {
    lines.push(
      `  Guesses:${b.guesses
        .map((g) => `\n    ~ ${g.text}${g.rationale ? ` (${g.rationale})` : ""}`)
        .join("")}`,
    );
  }
  lines.push(
    b.open.length
      ? `  Open:${b.open.map((o) => `\n    ? ${o}`).join("")}`
      : "  Open:    (none)",
  );
  return lines.join("\n");
}
