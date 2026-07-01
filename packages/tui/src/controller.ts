import type { Session } from "../../engine/src/index.ts";
import { renderEvent } from "./render.ts";

/**
 * The TUI's I/O seam — an async source of user lines and a text sink. Abstracted
 * so the conversation loop can be driven by a real terminal (readline) in the
 * entrypoint, or by a fake async iterable in tests. No TTY needed to test.
 */
export interface TuiIO {
  readonly input: AsyncIterable<string>;
  write(text: string): void;
}

export interface RunOptions {
  /** Prompt string written before each user turn (e.g. "» "). */
  readonly prompt?: string;
}

/**
 * Drive a conversation: read a line, send it through the Session, render the
 * streamed events, repeat. `/exit` or `/quit` ends the loop. This is the whole
 * of the terminal front-end's logic — everything else is engine.
 */
export async function runConversation(
  session: Session,
  io: TuiIO,
  opts: RunOptions = {},
): Promise<void> {
  const prompt = opts.prompt ?? "";
  if (prompt) io.write(prompt);

  for await (const line of io.input) {
    const trimmed = line.trim();
    if (trimmed === "/exit" || trimmed === "/quit") break;

    if (trimmed !== "") {
      for await (const ev of session.send(trimmed)) {
        io.write(renderEvent(ev));
      }
      io.write("\n");
    }

    if (prompt) io.write(prompt);
  }
}
