import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileMemoryStore } from "../src/index.ts";
import { createMaker } from "../../engine/src/index.ts";
import type { InferenceBackend } from "../../engine/src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";

async function tmp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

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

async function drain(s: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of s) {
    void _;
  }
}

test("file store round-trips values and lists keys by prefix", async () => {
  const store = fileMemoryStore({ dir: await tmp("maker-store-") });
  await store.set("tool:brief", { goal: "x" });
  await store.set("tool:files", { "index.html": "hi" });
  assert.deepEqual(await store.get("tool:brief"), { goal: "x" });
  assert.equal(await store.get("missing"), undefined);
  const keys = await store.keys("tool:");
  assert.equal(keys.length, 2);
  await store.delete("tool:brief");
  assert.equal(await store.get("tool:brief"), undefined);
});

test("a tool + Brief survive a restart (build, quit, restore)", async () => {
  const storeDir = await tmp("maker-persist-");
  const rootDir = await tmp("maker-tools-");
  const reply =
    "```brief\n" +
    JSON.stringify({ goal: "a greeting", decided: ["says hi"] }) +
    "\n```\n```html path=index.html\n<h1>Hello from Maker</h1>\n```";

  // Session 1: build a tool, then "quit".
  const maker1 = createMaker({
    inference: scripted([reply]),
    runtime: localWebRuntime({ rootDir }),
    store: fileMemoryStore({ dir: storeDir }),
  });
  await drain(maker1.express("build a greeting page"));
  await maker1.stop();

  // Session 2: fresh Maker over the same store — restore without any model turn.
  const maker2 = createMaker({
    inference: scripted(["unused"]),
    runtime: localWebRuntime({ rootDir }),
    store: fileMemoryStore({ dir: storeDir }),
  });
  try {
    const restored = await maker2.restore();
    assert.equal(restored, true);
    assert.equal(maker2.brief.goal, "a greeting");
    assert.deepEqual(maker2.brief.decided, ["says hi"]);
    assert.ok(maker2.running, "the tool should be running again");
    const html = await (await fetch(maker2.running.url)).text();
    assert.match(html, /Hello from Maker/);
  } finally {
    await maker2.stop();
  }
});

test("restore returns false when nothing was saved", async () => {
  const maker = createMaker({
    inference: scripted(["x"]),
    runtime: localWebRuntime({ rootDir: await tmp("maker-empty-") }),
    store: fileMemoryStore({ dir: await tmp("maker-empty-store-") }),
  });
  assert.equal(await maker.restore(), false);
});
