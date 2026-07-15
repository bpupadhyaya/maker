import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createMaker, synthesizeFiles } from "../src/index.ts";
import type { InferenceBackend, MakerEvent } from "../src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";

/** A backend that returns canned replies in sequence — a stand-in for a model. */
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
  return fs.mkdtemp(path.join(os.tmpdir(), "maker-syn-"));
}

const BUILD_REPLY =
  "Here you go:\n```html path=index.html\n<!doctype html><h1>Counter: 0</h1>\n```";
const ITER_REPLY =
  "Added a button:\n```html path=index.html\n<!doctype html><h1>Counter: 0</h1><button>+</button>\n```";

test("express builds a tool and runs it (converse -> running tool)", async () => {
  const maker = createMaker({
    inference: scripted([BUILD_REPLY]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    const events = await collect(maker.express("build me a counter"));
    const running = events.find((e) => e.type === "tool-running");
    assert.ok(running && running.type === "tool-running", "should emit tool-running");
    const res = await fetch(running.url);
    assert.match(await res.text(), /Counter: 0/);
  } finally {
    await maker.stop();
  }
});

test("express iterates: a second turn rebuilds the running tool", async () => {
  const maker = createMaker({
    inference: scripted([BUILD_REPLY, ITER_REPLY]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    await collect(maker.express("build me a counter"));
    const events = await collect(maker.express("add a plus button"));
    const running = events.find((e) => e.type === "tool-running");
    assert.ok(running && running.type === "tool-running");
    const html = await (await fetch(running.url)).text();
    assert.match(html, /<button>/);
  } finally {
    await maker.stop();
  }
});

test("a reply with no code block is a plain chat turn (no tool)", async () => {
  const maker = createMaker({
    inference: scripted(["Just thinking out loud — no tool yet."]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    const events = await collect(maker.express("hi"));
    assert.ok(!events.some((e) => e.type === "tool-running"));
    assert.ok(events.some((e) => e.type === "assistant-done"));
    assert.equal(maker.running, undefined);
  } finally {
    await maker.stop();
  }
});

test("a bare greeting does not trigger gap-detection clarifiers, and a real build request right after still does", async () => {
  const maker = createMaker({
    inference: scripted(["Hey! What would you like to build?", BUILD_REPLY]),
    runtime: localWebRuntime({ rootDir: await tmpRoot() }),
  });
  try {
    const hiEvents = await collect(maker.express("hi"));
    assert.ok(!hiEvents.some((e) => e.type === "clarify"), "\"hi\" must not produce a clarifier");

    const buildEvents = await collect(maker.express("build me a counter"));
    assert.ok(
      buildEvents.some((e) => e.type === "tool-running"),
      "the follow-up real build request must still work normally",
    );
  } finally {
    await maker.stop();
  }
});

test("synthesizeFiles parses paths, langs, and multiple files", () => {
  const files = synthesizeFiles(
    "```html path=index.html\n<h1>hi</h1>\n```\n```js\nconsole.log(1)\n```",
  );
  assert.equal(files["index.html"], "<h1>hi</h1>");
  assert.equal(files["app.js"], "console.log(1)");
});
