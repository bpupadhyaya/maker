import * as readline from "node:readline";
import { pathToFileURL } from "node:url";
import { createMaker, echoInference, ollamaInference } from "../../engine/src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";
import { fileMemoryStore, tasteMemory } from "../../store/src/index.ts";
import { runMakerConversation } from "./controller.ts";

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

  const store = fileMemoryStore();
  const maker = createMaker({
    inference,
    runtime: localWebRuntime(),
    store,
    taste: tasteMemory(store),
  });
  await maker.restore();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.stdout.write(
    `Maker — terminal (v1), backend=${backendName}. Describe a tool; /exit to quit.\n`,
  );

  const io = {
    input: rl,
    write: (text: string): void => {
      process.stdout.write(text);
    },
  };

  await runMakerConversation(maker, io, { prompt: "\n» " });
  await maker.stop();
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
