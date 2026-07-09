import { test } from "node:test";
import assert from "node:assert/strict";
import { llamaCppInference } from "../src/backends/llamacpp-inference.ts";
import type { FetchLike } from "../src/backends/ollama-inference.ts";
import type { ChatMessage } from "../src/types.ts";

// --- Regression: large models are tuned with SMALLER context windows (less RAM
// headroom left after their bigger weights), so a long conversation can exceed
// the window well before it would with a small model — llama.cpp then rejects
// the WHOLE request with HTTP 400 "exceeds the available context size". The
// backend must retry with the oldest turns dropped instead of surfacing a raw
// crash. Reproduced live against a real llama-server + the user's own corrupted
// 26-turn history (see session.ts's own tests for the alternation half of this).

function sseFrom(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

function contextOverflowBody(nPromptTokens: number, nCtx: number): string {
  return JSON.stringify({
    error: {
      code: 400,
      message: `request (${nPromptTokens} tokens) exceeds the available context size (${nCtx} tokens), try increasing it`,
      type: "exceed_context_size_error",
      n_prompt_tokens: nPromptTokens,
      n_ctx: nCtx,
    },
  });
}

async function collect(gen: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const c of gen) out += c;
  return out;
}

function longHistory(pairs: number): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "sys" }];
  for (let i = 0; i < pairs; i++) {
    out.push({ role: "user", content: `turn ${i}` });
    out.push({ role: "assistant", content: `reply ${i}` });
  }
  out.push({ role: "user", content: "final question" });
  return out;
}

test("context overflow: retries with the oldest turns dropped, then succeeds", async () => {
  const seenLengths: number[] = [];
  const fetchLog: FetchLike = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
    seenLengths.push(body.messages.length);
    // Keep failing until only the system + final question remain (2 messages).
    if (body.messages.length > 2) {
      return new Response(contextOverflowBody(9000, 2048), { status: 400 });
    }
    return new Response(sseFrom("ok now it fits"), { status: 200 });
  };
  const backend = llamaCppInference({ fetch: fetchLog });
  const out = await collect(backend.generate({ messages: longHistory(6) })); // 1 sys + 6 pairs + 1 = 14
  assert.equal(out, "ok now it fits");
  // Each retry must have dropped exactly one user/assistant pair (2 messages).
  assert.ok(seenLengths.length > 1, "should have retried at least once");
  for (let i = 1; i < seenLengths.length; i++) {
    assert.equal(seenLengths[i - 1]! - seenLengths[i]!, 2, "each retry drops exactly one pair");
  }
  assert.equal(seenLengths[seenLengths.length - 1], 2, "final attempt kept system + the final turn");
});

test("context overflow: the system message and the final turn are never dropped", async () => {
  let lastMessages: ChatMessage[] = [];
  const fetchLog: FetchLike = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: ChatMessage[] };
    lastMessages = body.messages;
    if (body.messages.length > 2) return new Response(contextOverflowBody(9000, 2048), { status: 400 });
    return new Response(sseFrom("done"), { status: 200 });
  };
  const backend = llamaCppInference({ fetch: fetchLog });
  await collect(backend.generate({ messages: longHistory(5) }));
  assert.equal(lastMessages[0]?.role, "system");
  assert.equal(lastMessages[lastMessages.length - 1]?.content, "final question");
});

test("a non-context-overflow 400 is NOT retried, and the real error body surfaces", async () => {
  let calls = 0;
  const fetchLog: FetchLike = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 400, message: "some other validation error", type: "invalid_request" } }), { status: 400, statusText: "Bad Request" });
  };
  const backend = llamaCppInference({ fetch: fetchLog });
  await assert.rejects(
    () => collect(backend.generate({ messages: longHistory(1) })),
    (err: Error) => {
      assert.match(err.message, /some other validation error/, "the real llama.cpp error body should surface, not just a bare status");
      return true;
    },
  );
  assert.equal(calls, 1, "a non-context error must not trigger the trim-and-retry loop");
});

test("context overflow that never resolves (pathological) fails cleanly instead of looping forever", async () => {
  let calls = 0;
  const fetchLog: FetchLike = async () => {
    calls++;
    return new Response(contextOverflowBody(50000, 2048), { status: 400 });
  };
  const backend = llamaCppInference({ fetch: fetchLog });
  await assert.rejects(() => collect(backend.generate({ messages: longHistory(1) })));
  assert.ok(calls <= 8, `must give up within a bounded number of attempts, got ${calls}`);
});

test("the normal (non-overflow) path is unaffected — single request, no retry", async () => {
  let calls = 0;
  const fetchLog: FetchLike = async () => {
    calls++;
    return new Response(sseFrom("hello"), { status: 200 });
  };
  const backend = llamaCppInference({ fetch: fetchLog });
  const out = await collect(backend.generate({ messages: [{ role: "user", content: "hi" }] }));
  assert.equal(out, "hello");
  assert.equal(calls, 1);
});
