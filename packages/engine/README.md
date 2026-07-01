# @maker/engine

Maker's **headless, UI-agnostic engine** — the conductor and its interfaces.
Everything else (the TUI, the GUI, inference/runtime/memory backends) is a thin
client or an adapter over this package. See `../../docs/DESIGN.md` for the *why*
and `../../docs/ROADMAP.md` for the milestone plan.

## What's here (M0.1)

- **`src/interfaces/`** — the seams the engine depends on, nothing more:
  - `InferenceBackend` — local text generation (echo now; Ollama/llama.cpp/MLX later)
  - `ToolRuntime` — build + run the generated web/TS tool locally (M0.4)
  - `BriefStore` / `Brief` — the user-visible understanding (M0.6)
  - `MemoryStore` — local, offline persistence (M0.7)
- **`src/session.ts`** — `createSession()`, the core surface: send a message,
  receive a stream of `MakerEvent`s.
- **`src/backends/echo-inference.ts`** — a no-op backend that proves the streaming
  contract end to end without a model.

## Run the tests (no install needed)

Uses Node's native TypeScript support + built-in test runner:

```sh
node --test "test/**/*.test.ts"
# or, from the repo root:
npm test
```

## Design invariant

The engine never knows what OS or front-end it's running under. Platform and UI
variance lives entirely behind the interfaces above — that's what makes one
codebase serve macOS/Linux/Windows and both front-ends.
