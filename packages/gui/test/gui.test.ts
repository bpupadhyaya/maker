import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutFor,
  fractionToPreset,
  PRESET_FRACTIONS,
  COLLAPSE_WIDTH,
} from "../src/layout.ts";
import { initialViewModel, addUserTurn, reduce } from "../src/view-model.ts";
import type { ViewModel } from "../src/view-model.ts";
import type { MakerEvent } from "../../engine/src/index.ts";

test("layout presets favor conversation at Talk, tool at Build", () => {
  assert.ok(PRESET_FRACTIONS.talk > PRESET_FRACTIONS.split);
  assert.ok(PRESET_FRACTIONS.split > PRESET_FRACTIONS.build);
  assert.equal(layoutFor("split", 1200).collapsed, false);
});

test("narrow width collapses to a single column", () => {
  assert.equal(layoutFor("split", COLLAPSE_WIDTH - 1).collapsed, true);
  assert.equal(layoutFor("build", COLLAPSE_WIDTH + 1).collapsed, false);
});

test("a dragged fraction snaps to the nearest preset", () => {
  assert.equal(fractionToPreset(0.71), "talk");
  assert.equal(fractionToPreset(0.54), "split");
  assert.equal(fractionToPreset(0.3), "build");
});

test("the view-model reducer folds a whole turn", () => {
  let vm: ViewModel = initialViewModel();
  vm = addUserTurn(vm, "build me a timer");
  const events: MakerEvent[] = [
    { type: "assistant-delta", text: "Here'" },
    { type: "assistant-delta", text: "s a timer" },
    { type: "assistant-done", text: "Here's a timer" },
    {
      type: "brief-updated",
      brief: { goal: "a timer", decided: [], guesses: [], open: [] },
    },
    { type: "tool-running", url: "http://127.0.0.1:5123/" },
  ];
  for (const ev of events) vm = reduce(vm, ev);

  assert.equal(vm.streaming, "");
  assert.deepEqual(
    vm.transcript.map((t) => t.role),
    ["user", "assistant"],
  );
  assert.equal(vm.transcript[1]?.text, "Here's a timer");
  assert.equal(vm.brief?.goal, "a timer");
  assert.equal(vm.toolUrl, "http://127.0.0.1:5123/");
});

test("errors land in the transcript and clear streaming", () => {
  let vm = initialViewModel();
  vm = reduce(vm, { type: "assistant-delta", text: "partial" });
  vm = reduce(vm, { type: "error", message: "backend exploded" });
  assert.equal(vm.streaming, "");
  assert.equal(vm.transcript.at(-1)?.role, "error");
  assert.match(vm.transcript.at(-1)?.text ?? "", /exploded/);
});
