import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyKind, detectGaps } from "../src/index.ts";

test("classifyKind recognizes common tool kinds", () => {
  assert.equal(classifyKind("build me a tip calculator"), "money");
  assert.equal(classifyKind("a pomodoro timer"), "timer");
  assert.equal(classifyKind("a todo list tracker"), "list");
  assert.equal(classifyKind("a contact form"), "form");
  assert.equal(classifyKind("something to help me think"), "generic");
});

test("money tool asks about the invisible/expensive gaps (currency, rounding)", () => {
  const { kind, clarifiers } = detectGaps("build a tip calculator");
  assert.equal(kind, "money");
  const ids = clarifiers.map((c) => c.id);
  assert.ok(ids.includes("money.currency"));
  assert.ok(ids.includes("money.rounding"));
});

test("clarifiers are propose-a-default form (a question fused with a guess)", () => {
  const { clarifiers } = detectGaps("build a tip calculator");
  for (const c of clarifiers) {
    assert.match(c.prompt, /I'll assume .+ — right, or something else\?/);
    assert.ok(c.proposedDefault.length > 0);
  }
});

test("visible/cheap gaps become labeled guesses, not questions", () => {
  const { clarifiers, guesses } = detectGaps("make a todo list");
  const clarifierIds = clarifiers.map((c) => c.id);
  // sort order is visible + cheap -> guessed, never asked
  assert.ok(!clarifierIds.includes("list.sort"));
  assert.ok(guesses.some((g) => g.text.includes("Sort order")));
});

test("asking is bounded by maxAsk (restraint); overflow becomes guesses", () => {
  const { clarifiers, guesses } = detectGaps("a contact form", { maxAsk: 1 });
  assert.equal(clarifiers.length, 1);
  assert.ok(guesses.length >= 1);
});

test("known gaps are skipped (memory shrinks the question set)", () => {
  const { clarifiers } = detectGaps("build a tip calculator", {
    known: ["money.currency", "money.rounding", "money.tax"],
  });
  assert.equal(clarifiers.length, 0);
});
