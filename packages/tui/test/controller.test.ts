import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, echoInference } from "../../engine/src/index.ts";
import { runConversation } from "../src/controller.ts";
import type { TuiIO } from "../src/controller.ts";
import { renderEvent } from "../src/render.ts";

async function* lines(...xs: string[]): AsyncIterable<string> {
  for (const x of xs) yield x;
}

function capture(): { readonly text: string; write(t: string): void } {
  let out = "";
  return {
    get text() {
      return out;
    },
    write(t: string) {
      out += t;
    },
  };
}

test("runConversation streams a reply then exits on /exit", async () => {
  const session = createSession({ inference: echoInference() });
  const sink = capture();
  const io: TuiIO = { input: lines("hello", "/exit"), write: sink.write };
  await runConversation(session, io);
  assert.match(sink.text, /echo: hello/);
});

test("blank lines are ignored, /quit also exits", async () => {
  const session = createSession({ inference: echoInference() });
  const sink = capture();
  await runConversation(
    session,
    { input: lines("", "   ", "hi", "/quit"), write: sink.write },
  );
  assert.match(sink.text, /echo: hi/);
});

test("the prompt string is written between turns", async () => {
  const session = createSession({ inference: echoInference() });
  const sink = capture();
  await runConversation(
    session,
    { input: lines("hi", "/exit"), write: sink.write },
    { prompt: "» " },
  );
  assert.match(sink.text, /» /);
});

test("renderEvent formats every event type", () => {
  assert.equal(renderEvent({ type: "assistant-delta", text: "abc" }), "abc");
  assert.equal(renderEvent({ type: "assistant-done", text: "abc" }), "");
  assert.match(renderEvent({ type: "error", message: "boom" }), /boom/);
  assert.match(
    renderEvent({ type: "tool-running", url: "http://localhost:5173" }),
    /localhost:5173/,
  );
});
