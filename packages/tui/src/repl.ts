import * as readline from "node:readline";
import { pathToFileURL } from "node:url";
import {
  createSession,
  echoInference,
  ollamaInference,
} from "../../engine/src/index.ts";
import { runConversation } from "./controller.ts";

/**
 * The M0.3 terminal entrypoint: a zero-dependency readline REPL, a thin client
 * over the engine. `MAKER_BACKEND=ollama` swaps the echo stub for a real local
 * model (M0.2) — nothing else changes, because both are just InferenceBackends.
 *
 * (A richer Ink-based terminal UI — Talk/Split/Build in the terminal — is a
 * later polish milestone; it needs a network install of Ink. This REPL keeps
 * the front-end usable and fully offline today.)
 */
export async function main(): Promise<void> {
  const backendName = process.env["MAKER_BACKEND"] ?? "echo";
  const inference =
    backendName === "ollama" ? ollamaInference() : echoInference();

  const session = createSession({
    inference,
    systemPrompt:
      "You are Maker, a collaborator that builds tools by conversation.",
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.stdout.write(
    `Maker — terminal (M0.3), backend=${backendName}. Type /exit to quit.\n`,
  );

  const io = {
    input: rl,
    write: (text: string): void => {
      process.stdout.write(text);
    },
  };

  await runConversation(session, io, { prompt: "\n» " });
  rl.close();
}

// Auto-run only when invoked directly (not when imported by tests/index).
const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
