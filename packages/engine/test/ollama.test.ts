import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/index.ts";
import { ollamaInference } from "../src/backends/ollama-inference.ts";
import type { FetchLike } from "../src/backends/ollama-inference.ts";
import type { MakerEvent } from "../src/index.ts";

async function collect(stream: AsyncIterable<MakerEvent>): Promise<MakerEvent[]> {
  const out: MakerEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

/** Build a fake fetch that streams the given NDJSON lines as an Ollama chat response. */
function fakeChat(lines: string[], status = 200): FetchLike {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(lines.join("\n") + "\n", { status });
  };
}

const HELLO_STREAM = [
  JSON.stringify({ message: { role: "assistant", content: "Hel" }, done: false }),
  JSON.stringify({ message: { role: "assistant", content: "lo" }, done: false }),
  JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
];

test("ollama backend streams content chunks across NDJSON lines", async () => {
  const backend = ollamaInference({ fetch: fakeChat(HELLO_STREAM) });
  const chunks: string[] = [];
  for await (const c of backend.generate({ messages: [{ role: "user", content: "hi" }] })) {
    chunks.push(c);
  }
  assert.deepEqual(chunks, ["Hel", "lo"]);
});

test("ollama backend stops at the done line", async () => {
  const withTrailing = [...HELLO_STREAM,
    JSON.stringify({ message: { content: "IGNORED" }, done: false }),
  ];
  const backend = ollamaInference({ fetch: fakeChat(withTrailing) });
  const chunks: string[] = [];
  for await (const c of backend.generate({ messages: [{ role: "user", content: "hi" }] })) {
    chunks.push(c);
  }
  assert.ok(!chunks.includes("IGNORED"), "must not emit content after done:true");
});

test("ollama backend plugs into a session unchanged (pluggability)", async () => {
  const session = createSession({
    inference: ollamaInference({ fetch: fakeChat(HELLO_STREAM) }),
  });
  const events = await collect(session.send("hi"));
  const done = events.find((e) => e.type === "assistant-done");
  assert.equal(done?.type === "assistant-done" ? done.text : "", "Hello");
});

test("isAvailable reflects daemon reachability", async () => {
  const up = ollamaInference({ fetch: fakeChat(HELLO_STREAM) });
  assert.equal(await up.isAvailable(), true);

  const down = ollamaInference({
    fetch: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(await down.isAvailable(), false);
});

test("a non-OK HTTP status surfaces as a thrown error (→ error event in a session)", async () => {
  const session = createSession({
    inference: ollamaInference({ fetch: fakeChat([], 500) }),
  });
  const events = await collect(session.send("hi"));
  const err = events.find((e) => e.type === "error");
  assert.ok(err && err.type === "error" && /500/.test(err.message));
});
