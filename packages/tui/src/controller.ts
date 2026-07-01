import type { Session, Maker, MakerEvent } from "../../engine/src/index.ts";
import { renderEvent } from "./render.ts";

/** A source of MakerEvents for a user line — a Session or a full Maker. */
export type Respond = (line: string) => AsyncIterable<MakerEvent>;

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
async function drive(
  respond: Respond,
  io: TuiIO,
  opts: RunOptions,
): Promise<void> {
  const prompt = opts.prompt ?? "";
  if (prompt) io.write(prompt);

  for await (const line of io.input) {
    const trimmed = line.trim();
    if (trimmed === "/exit" || trimmed === "/quit") break;

    if (trimmed !== "") {
      for await (const ev of respond(trimmed)) {
        io.write(renderEvent(ev));
      }
      io.write("\n");
    }

    if (prompt) io.write(prompt);
  }
}

/** Drive a plain chat Session (echo/model, no tool building). */
export async function runConversation(
  session: Session,
  io: TuiIO,
  opts: RunOptions = {},
): Promise<void> {
  await drive((line) => session.send(line), io, opts);
}

/** Drive the full Maker — builds/verifies/persists real tools. */
export async function runMakerConversation(
  maker: Maker,
  io: TuiIO,
  opts: RunOptions = {},
): Promise<void> {
  await drive((line) => maker.express(line), io, opts);
}
