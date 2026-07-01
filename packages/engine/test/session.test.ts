import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, echoInference } from "../src/index.ts";
import type { InferenceBackend, MakerEvent } from "../src/index.ts";

async function collect(stream: AsyncIterable<MakerEvent>): Promise<MakerEvent[]> {
  const out: MakerEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

test("session streams echoed assistant deltas and a done event", async () => {
  const session = createSession({ inference: echoInference() });
  const events = await collect(session.send("hello world"));

  const deltas = events.filter((e) => e.type === "assistant-delta");
  assert.ok(deltas.length > 0, "should stream at least one delta");

  const done = events.find((e) => e.type === "assistant-done");
  assert.ok(done, "should emit an assistant-done event");
  assert.equal(
    done.type === "assistant-done" ? done.text : "",
    "echo: hello world",
  );

  // The streamed deltas must reassemble into the final text.
  const assembled = deltas
    .map((e) => (e.type === "assistant-delta" ? e.text : ""))
    .join("");
  assert.equal(assembled, "echo: hello world");
});

test("session records conversation history (user + assistant)", async () => {
  const session = createSession({ inference: echoInference() });
  await collect(session.send("hi"));
  assert.equal(session.history.length, 2);
  assert.equal(session.history[0]?.role, "user");
  assert.equal(session.history[1]?.role, "assistant");
  assert.equal(session.history[1]?.content, "echo: hi");
});

test("a system prompt seeds history before the first turn", async () => {
  const session = createSession({
    inference: echoInference(),
    systemPrompt: "you are Maker",
  });
  assert.equal(session.history[0]?.role, "system");
});

test("backend errors surface as error events, not throws", async () => {
  const failing: InferenceBackend = {
    name: "boom",
    async isAvailable() {
      return false;
    },
    // eslint-disable-next-line require-yield
    async *generate(): AsyncIterable<string> {
      throw new Error("backend exploded");
    },
  };
  const session = createSession({ inference: failing });
  const events = await collect(session.send("x"));
  const err = events.find((e) => e.type === "error");
  assert.ok(
    err && err.type === "error" && /exploded/.test(err.message),
    "should emit an error event carrying the backend message",
  );
});

test("the InferenceBackend seam is swappable (proves pluggability)", async () => {
  // A second, different backend implementing the same interface.
  const shout: InferenceBackend = {
    name: "shout",
    async isAvailable() {
      return true;
    },
    async *generate(req): AsyncIterable<string> {
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      yield (last?.content ?? "").toUpperCase();
    },
  };
  const session = createSession({ inference: shout });
  const events = await collect(session.send("quiet"));
  const done = events.find((e) => e.type === "assistant-done");
  assert.equal(done?.type === "assistant-done" ? done.text : "", "QUIET");
});
