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
  /** Slash-commands handled by the front-end (matched by first token; get the rest as an arg). */
  readonly commands?: Readonly<Record<string, (arg: string) => Promise<void> | void>>;
  /** Observe each streamed event (e.g. to open the living tool in a browser). */
  readonly onEvent?: (ev: MakerEvent) => void;
  /** Resolve a typed /name (not a built-in command) to a saved macro prompt. */
  readonly resolveMacro?: (name: string) => Promise<string | undefined>;
  /** Called with each expressed line (after macro expansion) — e.g. to record history. */
  readonly onRequest?: (line: string) => void;
  /** Intercept a natural-language line (e.g. "save the project in ~/Downloads")
   *  before it reaches the model. Return true if fully handled. */
  readonly intercept?: (line: string) => Promise<boolean>;
  /** Approval mode (H9.4): if this returns true, confirm y/n before building. */
  readonly needsApproval?: () => Promise<boolean> | boolean;
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

  const commands = opts.commands ?? {};
  let pendingApproval: string | undefined; // approval mode: a build awaiting y/n

  const expressLine = async (toExpress: string): Promise<void> => {
    opts.onRequest?.(toExpress);
    for await (const ev of respond(toExpress)) {
      opts.onEvent?.(ev);
      io.write(renderEvent(ev));
    }
    io.write("\n");
  };

  for await (const line of io.input) {
    const trimmed = line.trim();

    // A build is waiting for confirmation — this line is the y/n answer.
    if (pendingApproval !== undefined) {
      const req = pendingApproval;
      pendingApproval = undefined;
      if (/^y(es)?$/i.test(trimmed)) await expressLine(req);
      else io.write("Cancelled — nothing built.\n");
      if (prompt) io.write(prompt);
      continue;
    }

    // Quit on the natural phrasings too — "quit" without the slash went to the
    // model, which said goodbye without quitting.
    if (/^\/?(exit|quit|q)$/i.test(trimmed)) break;

    const parts = trimmed.split(/\s+/);
    const head = parts[0] ?? "";
    const command = commands[head];
    if (command) {
      await command(parts.slice(1).join(" "));
    } else if (trimmed !== "" && opts.intercept && (await opts.intercept(trimmed))) {
      // handled without the model (e.g. a permission-gated file operation)
    } else if (trimmed !== "") {
      // A typed /name that isn't a built-in may be a custom macro → expand it.
      let toExpress = trimmed;
      if (head.startsWith("/") && opts.resolveMacro) {
        const macro = await opts.resolveMacro(head.slice(1));
        if (macro !== undefined) {
          io.write(`(macro ${head} → ${macro})\n`);
          toExpress = macro;
        }
      }
      // Approval mode: confirm before sending the build to the model.
      if (opts.needsApproval && (await opts.needsApproval())) {
        io.write(`Build: ${toExpress}\n  Proceed? (y/n) `);
        pendingApproval = toExpress;
        continue; // wait for the y/n on the next line (prompt not re-written)
      }
      await expressLine(toExpress);
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

/** Drive the full Maker — builds/verifies/persists real tools. `takeImages`, if
 *  given, supplies (and clears) any pending images to attach to the next turn. */
export async function runMakerConversation(
  maker: Maker,
  io: TuiIO,
  opts: RunOptions = {},
  takeImages?: () => readonly string[] | undefined,
): Promise<void> {
  await drive((line) => {
    const images = takeImages?.();
    return maker.express(line, images && images.length ? { images } : undefined);
  }, io, opts);
}
