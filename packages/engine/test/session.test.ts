import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, echoInference, normalizeAlternation } from "../src/index.ts";
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

// --- Regression: strict-alternation chat templates (Llama 3.x, Qwen2.5, …)
// reject non-alternating roles with an HTTP 400 ("prompt not well formed").
// History could end up with two consecutive "user" turns if a prior turn
// errored (dangling push) or two turns were sent concurrently (e.g. an
// impatient resend while a large/slow model is still replying).

test("normalizeAlternation merges consecutive same-role messages", () => {
  const merged = normalizeAlternation([
    { role: "system", content: "sys" },
    { role: "user", content: "first" },
    { role: "user", content: "second" }, // dangling turn from a prior error
    { role: "assistant", content: "reply" },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged[1]?.role, "user");
  assert.equal(merged[1]?.content, "first\n\nsecond");
});

test("normalizeAlternation never merges across a system message", () => {
  const merged = normalizeAlternation([
    { role: "system", content: "a" },
    { role: "system", content: "b" },
  ]);
  assert.equal(merged.length, 2, "system messages are never merged into one another");
});

test("an errored turn does NOT leave a dangling user message in history", async () => {
  const failing: InferenceBackend = {
    name: "boom",
    async isAvailable() { return false; },
    // eslint-disable-next-line require-yield
    async *generate(): AsyncIterable<string> { throw new Error("backend exploded"); },
  };
  const session = createSession({ inference: failing });
  await collect(session.send("first (will fail)"));
  assert.equal(session.history.length, 0, "the failed turn's user push must be reverted");

  // A retry after the failure must be a clean, single user turn — not stacked
  // on top of the reverted one.
  await collect(session.send("second (also fails)"));
  assert.equal(session.history.length, 0);
});

test("a second send() while one is still streaming is rejected, not corrupting history", async () => {
  let resolveFirst: (() => void) | undefined;
  const slow: InferenceBackend = {
    name: "slow",
    async isAvailable() { return true; },
    async *generate(): AsyncIterable<string> {
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
      yield "slow reply";
    },
  };
  const session = createSession({ inference: slow });
  const firstEvents: MakerEvent[] = [];
  const firstDone = (async () => {
    for await (const e of session.send("first (slow)")) firstEvents.push(e);
  })();

  // Give the first turn a tick to push its user message and start streaming.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(session.history.length, 1, "the first turn's user message should be pushed");

  // A second turn arrives while the first is still in flight — must be rejected.
  const secondEvents = await collect(session.send("second (concurrent)"));
  assert.equal(secondEvents.length, 1);
  assert.equal(secondEvents[0]?.type, "error");
  assert.equal(session.history.length, 1, "the concurrent turn must NOT push a second user message");

  resolveFirst?.();
  await firstDone;
  assert.equal(session.history.length, 2, "the first turn completes normally once unblocked");
  assert.equal(session.history[0]?.role, "user");
  assert.equal(session.history[1]?.role, "assistant");
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
