import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseBriefBlock,
  mergeBrief,
  renderBrief,
  emptyBrief,
  createMaker,
  synthesizeFiles,
} from "../src/index.ts";
import type { InferenceBackend, MakerEvent } from "../src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";

function scripted(responses: string[]): InferenceBackend {
  let i = 0;
  return {
    name: "scripted",
    async isAvailable() {
      return true;
    },
    async *generate(): AsyncIterable<string> {
      const r = responses[Math.min(i, responses.length - 1)] ?? "";
      i += 1;
      yield r;
    },
  };
}

async function collect(s: AsyncIterable<MakerEvent>): Promise<MakerEvent[]> {
  const out: MakerEvent[] = [];
  for await (const e of s) out.push(e);
  return out;
}
async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "maker-brief-"));
}

test("parseBriefBlock extracts goal/decided/guesses/open", () => {
  const patch = parseBriefBlock(
    "```brief\n" +
      JSON.stringify({
        goal: "a tip calculator",
        decided: ["rounds to cents"],
        guesses: [{ text: "USD", rationale: "no currency given" }],
        open: ["split between how many people?"],
      }) +
      "\n```",
  );
  assert.equal(patch?.goal, "a tip calculator");
  assert.deepEqual(patch?.decided, ["rounds to cents"]);
  assert.equal(patch?.guesses?.[0]?.text, "USD");
  assert.equal(patch?.open?.[0], "split between how many people?");
});

test("mergeBrief replaces provided fields and keeps the rest", () => {
  const base = mergeBrief(emptyBrief(), { goal: "g", decided: ["d1"] });
  const next = mergeBrief(base, { decided: ["d1", "d2"] });
  assert.equal(next.goal, "g");
  assert.deepEqual(next.decided, ["d1", "d2"]);
});

test("the ```brief``` block is NOT turned into a tool file", () => {
  const files = synthesizeFiles(
    "```brief\n{\"goal\":\"x\"}\n```\n```html path=index.html\n<h1>hi</h1>\n```",
  );
  assert.deepEqual(Object.keys(files), ["index.html"]);
});

test("createMaker seeds the goal from the first request and emits brief-updated", async () => {
  const reply = "```html path=index.html\n<h1>hi</h1>\n```";
  const maker = createMaker({
    inference: scripted([reply]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    const events = await collect(maker.express("build me a stopwatch"));
    const bu = events.find((e) => e.type === "brief-updated");
    assert.ok(bu && bu.type === "brief-updated");
    assert.equal(bu.brief.goal, "build me a stopwatch");
    assert.equal(maker.brief.goal, "build me a stopwatch");
  } finally {
    await maker.stop();
  }
});

test("a model-emitted brief block populates decided/open", async () => {
  const reply =
    "```brief\n" +
    JSON.stringify({ goal: "a timer", decided: ["counts up"], open: ["max time?"] }) +
    "\n```\n```html path=index.html\n<h1>timer</h1>\n```";
  const maker = createMaker({
    inference: scripted([reply]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    await collect(maker.express("make a timer"));
    assert.equal(maker.brief.goal, "a timer");
    assert.deepEqual(maker.brief.decided, ["counts up"]);
    assert.deepEqual(maker.brief.open, ["max time?"]);
  } finally {
    await maker.stop();
  }
});

test("renderBrief produces a readable plain-language projection", () => {
  const text = renderBrief(
    mergeBrief(emptyBrief(), { goal: "a tip calc", open: ["how many people?"] }),
  );
  assert.match(text, /Goal:.*tip calc/);
  assert.match(text, /how many people\?/);
});
