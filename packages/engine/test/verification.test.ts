import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  evaluateCheck,
  runChecks,
  reportViolations,
  smokeCheck,
  containsCheck,
  parseChecksBlock,
} from "../src/index.ts";
import type { Check, CheckContext } from "../src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";

const ctx = (text: string, status = 200): CheckContext => ({ status, text });

test("evaluateCheck handles status / contains / notContains", () => {
  assert.equal(evaluateCheck(smokeCheck(), ctx("x", 200)).passed, true);
  assert.equal(evaluateCheck(smokeCheck(), ctx("x", 404)).passed, false);
  assert.equal(evaluateCheck(containsCheck("c", "Hi"), ctx("<h1>Hi</h1>")).passed, true);
  assert.equal(evaluateCheck(containsCheck("c", "Bye"), ctx("<h1>Hi</h1>")).passed, false);
});

test("a contains-violation reports a concrete repro", () => {
  const r = evaluateCheck(containsCheck("c", "Counter"), ctx("<h1>nope</h1>"));
  assert.equal(r.passed, false);
  assert.match(r.detail, /expected the tool to show "Counter"/);
});

test("runChecks evaluates against a real running tool (offline)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maker-verify-"));
  const rt = localWebRuntime({ rootDir: root });
  const running = await rt.run(
    await rt.build({
      id: "counter",
      files: { "index.html": "<!doctype html><h1>Counter: 0</h1>" },
    }),
  );
  try {
    const checks: Check[] = [
      smokeCheck(),
      containsCheck("has-counter", "Counter"),
      { id: "no-error", description: "no error banner", assert: { type: "notContains", text: "ERROR" } },
    ];
    const results = await runChecks(running.url, checks);
    assert.ok(results.every((r) => r.passed), JSON.stringify(results));
  } finally {
    await running.stop();
  }
});

test("a violation is caught against a running tool and reported", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maker-verify2-"));
  const rt = localWebRuntime({ rootDir: root });
  const running = await rt.run(
    await rt.build({
      id: "broken",
      files: { "index.html": "<!doctype html><h1>oops</h1>" },
    }),
  );
  try {
    const results = await runChecks(running.url, [containsCheck("wants-timer", "Timer")]);
    const violations = reportViolations(results);
    assert.equal(violations.length, 1);
    assert.match(violations[0] ?? "", /Timer/);
  } finally {
    await running.stop();
  }
});

test("parseChecksBlock reads ratified checks from a reserved block", () => {
  const checks = parseChecksBlock(
    "```checks\n" +
      JSON.stringify([
        { id: "c1", description: "shows the total", contains: "Total" },
        { id: "c2", description: "no crash text", notContains: "undefined" },
      ]) +
      "\n```",
  );
  assert.equal(checks.length, 2);
  assert.equal(checks[0]?.assert.type, "contains");
  assert.equal(checks[1]?.assert.type, "notContains");
});
