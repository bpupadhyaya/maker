import type { Brief } from "./interfaces/brief.ts";
import type { Check } from "./verification.ts";

/**
 * Hand-off (the design's step 4): name the tool, document it, make it reusable.
 * Pure helpers here (no fs); the ejectable bundle is written by @maker/store's
 * writeHandoff. Ejectability is the ownership promise — take the code + Brief +
 * checks and leave.
 */

const STOP = new Set([
  "a", "an", "the", "me", "my", "build", "make", "create", "some",
  "please", "tool", "app", "that", "for", "to", "of",
]);

/** Derive a kebab-case name from the Brief goal. */
export function slugName(goal: string, fallback = "tool"): string {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP.has(w));
  const slug = words
    .slice(0, 4)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

/** A README generated from the Brief + checks. */
export function renderReadme(
  name: string,
  brief: Brief,
  checks: readonly Check[] = [],
): string {
  const out: string[] = [`# ${name}`, ""];
  if (brief.goal) out.push(brief.goal, "");
  out.push("Made with Maker — a tool built by conversation, runnable offline.", "");

  if (brief.decided.length) {
    out.push("## What it does", "");
    for (const d of brief.decided) out.push(`- ${d}`);
    out.push("");
  }
  if (brief.guesses.length) {
    out.push("## Assumptions", "");
    for (const g of brief.guesses) {
      out.push(`- ${g.text}${g.rationale ? ` (${g.rationale})` : ""}`);
    }
    out.push("");
  }
  if (brief.open.length) {
    out.push("## Open questions", "");
    for (const o of brief.open) out.push(`- ${o}`);
    out.push("");
  }
  if (checks.length) {
    out.push("## Checks", "");
    for (const c of checks) out.push(`- ${c.description}`);
    out.push("");
  }
  out.push(
    "## Run",
    "",
    "Open `index.html` in a browser, or serve this folder with any static server.",
    "",
  );
  return out.join("\n");
}

export interface HandoffManifest {
  readonly name: string;
  readonly brief: Brief;
  readonly checks: readonly Check[];
  readonly createdWith: string;
}

export function buildManifest(
  name: string,
  brief: Brief,
  checks: readonly Check[] = [],
): HandoffManifest {
  return { name, brief, checks, createdWith: "maker" };
}
