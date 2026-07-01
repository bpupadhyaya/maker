/**
 * Verification v1 (DESIGN.md -> "Verification without a precise spec"). Checks
 * are derived from the user's words — a smoke check always, plus ratified checks
 * the model emits in a reserved ```checks``` block. They are serializable data
 * (so the accumulated set becomes the regression net) and run offline against
 * the running tool. A violation is reported as a concrete repro, not a red X.
 */

export type Assertion =
  | { readonly type: "status"; readonly equals: number }
  | { readonly type: "contains"; readonly text: string }
  | { readonly type: "notContains"; readonly text: string };

export interface Check {
  readonly id: string;
  readonly description: string;
  readonly assert: Assertion;
}

export interface CheckContext {
  readonly status: number;
  readonly text: string;
}

export interface CheckResult {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly detail: string;
}

export function evaluateCheck(check: Check, ctx: CheckContext): CheckResult {
  const a = check.assert;
  const base = { id: check.id, description: check.description };
  switch (a.type) {
    case "status": {
      const passed = ctx.status === a.equals;
      return {
        ...base,
        passed,
        detail: passed ? "ok" : `expected HTTP ${a.equals}, got ${ctx.status}`,
      };
    }
    case "contains": {
      const passed = ctx.text.includes(a.text);
      return {
        ...base,
        passed,
        detail: passed
          ? "ok"
          : `expected the tool to show "${a.text}", but it wasn't on the page`,
      };
    }
    case "notContains": {
      const passed = !ctx.text.includes(a.text);
      return {
        ...base,
        passed,
        detail: passed ? "ok" : `the tool unexpectedly shows "${a.text}"`,
      };
    }
  }
}

/** Fetch the running tool once and evaluate every check against it. */
export async function runChecks(
  url: string,
  checks: readonly Check[],
): Promise<CheckResult[]> {
  const res = await fetch(url);
  const text = await res.text();
  const ctx: CheckContext = { status: res.status, text };
  return checks.map((c) => evaluateCheck(c, ctx));
}

/** Concrete repros for the failures — what the user sees, not a red/green count. */
export function reportViolations(results: readonly CheckResult[]): string[] {
  return results
    .filter((r) => !r.passed)
    .map((r) => `✗ ${r.description}: ${r.detail}`);
}

export function smokeCheck(): Check {
  return {
    id: "smoke",
    description: "the tool loads",
    assert: { type: "status", equals: 200 },
  };
}

export function containsCheck(id: string, text: string, description?: string): Check {
  return {
    id,
    description: description ?? `shows "${text}"`,
    assert: { type: "contains", text },
  };
}

/** Parse a reserved ```checks``` JSON block into ratified checks. */
export function parseChecksBlock(modelText: string): Check[] {
  const m = /```checks[^\n]*\n([\s\S]*?)```/.exec(modelText);
  if (!m) return [];
  try {
    const arr: unknown = JSON.parse(m[1] ?? "");
    if (!Array.isArray(arr)) return [];
    const checks: Check[] = [];
    for (const item of arr) {
      if (item === null || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = typeof o["id"] === "string" ? o["id"] : undefined;
      const description =
        typeof o["description"] === "string" ? o["description"] : (id ?? "check");
      if (typeof o["contains"] === "string") {
        checks.push({ id: id ?? `contains:${o["contains"]}`, description, assert: { type: "contains", text: o["contains"] } });
      } else if (typeof o["notContains"] === "string") {
        checks.push({ id: id ?? `not:${o["notContains"]}`, description, assert: { type: "notContains", text: o["notContains"] } });
      } else if (typeof o["status"] === "number") {
        checks.push({ id: id ?? `status:${o["status"]}`, description, assert: { type: "status", equals: o["status"] } });
      }
    }
    return checks;
  } catch {
    return [];
  }
}
