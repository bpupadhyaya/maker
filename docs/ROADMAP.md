# Maker — Build Roadmap

Execution plan (the *how/when*). Design rationale (the *why*) lives in [`DESIGN.md`];
the full product arc (H0→H4) is in `DESIGN.md` → *Product scope*. This file breaks each
horizon into ordered, independently-verifiable milestones — sized to be picked up one at a
time (e.g. by a `/loop` build run).

**Principle (Maker building Maker):** every milestone leaves something *runnable*. Order is
chosen so there's an end-to-end vertical slice as early as possible, then depth.

---

## H0 — Foundation (engine skeleton)

**Definition of done:** converse → a running small web tool appears → iterate one ring →
it persists — **fully offline**, from both the TUI and the GUI.

**Progress:** ✅ M0.0 (monorepo scaffold + CI skeleton) · ✅ M0.1 (engine core + the four
interfaces + echo backend + 5 passing tests, `node --test`, zero install, offline). Next: M0.2.

**Engineering guardrails (all milestones):**
- Engine is **headless + interface-first** — GUI/TUI/inference/runtime are thin clients/adapters.
- Each milestone ships with a **test that is its acceptance gate** (this also seeds Maker's own
  verification ethos).
- Nothing bundles the model; large native pieces are fetched/provisioned.

| # | Milestone | Goal (one line) | Acceptance gate (verifiable) | Key risk |
|---|---|---|---|---|
| **M0.0** | Repo & scaffolding | Monorepo: `engine` pkg + stubbed interfaces + web-UI + tauri + tui packages; CI skeleton | `bun test` + lint green on scaffold; layout matches headless-engine architecture | low |
| **M0.1** | Engine core + interfaces | Define `InferenceBackend`, `ToolRuntime`, `MemoryStore`, `BriefStore` + session API (message in → streamed events out); an echo/no-op engine | Test sends a message, receives streamed reply through the interface; interfaces documented | med (getting interfaces right) |
| **M0.2** | Inference backend (1, pluggable) | Implement `InferenceBackend` via **Ollama** (fastest integration) as a managed subprocess, streaming tokens | Engine returns a real local-model completion **offline**; the M0.1 stub still swaps in (proves pluggability) | med |
| **M0.3** | Terminal front-end (thin client) | Minimal **Ink TUI**: type → streamed model reply, over the engine | `maker` in a terminal = responsive conversational REPL with the local model | low |
| **M0.4** | Tool substrate + runtime + sandbox | Provision a **Bun/Node** runtime; template for a minimal web/TS tool; build + serve it locally, sandboxed | Given a hardcoded tool spec, runtime builds + runs a trivial web tool reachable/pokeable at localhost | **high** (build/run/sandbox plumbing) |
| **M0.5** | Synthesis loop (Understand→Build→Iterate v0) | Wire model → generate tool code → runtime builds+runs → return running tool; then one iterate | "build me a X" → running web tool; "change Y" → updated running tool. The minimal spiral | **high** (model→working code reliability) |
| **M0.6** | Brief v0 | Maintain goal/decided/guesses/open from the conversation; persist; render (TUI first) | After a few turns the Brief shows a sensible goal + ≥1 decided + open list; persists in-session | med |
| **M0.7** | Persistence / Evolve seed | `~/.maker` stores the tool + its Brief + session | Build a tool, quit, relaunch → tool + Brief still there and runnable | low |
| **M0.8** | GUI shell (Tauri) minimal | Tauri app: conversation + **living-tool webview** + Brief strip; same engine | GUI runs the full M0.5 loop; tool pokeable inline in the webview | med (webview wiring) |
| **M0.9** | Offline install + provisioning + gate | First-run: detect hardware, fetch/sideload model, provision runtime+inference, checksum-verify; **network-off self-check**; one packaged installer via CI | Fresh machine → guided provisioning → offline gate passes → H0 loop works with **network OFF** | **high** (packaging/provisioning grind) |

**Ordering rationale:** M0.0–M0.3 get a talking-to-a-local-model slice fast (TUI before GUI —
lighter to stand up). M0.4–M0.5 add the "living tool" and the core loop (the riskiest, highest-
value pair). M0.6–M0.7 add memory of the session. M0.8 puts the GUI over the proven engine.
M0.9 makes it a real, installable, offline product.

**H0 risk-forward note:** M0.4, M0.5, M0.9 are the hard ones — plumbing (build/run/sandbox),
model-code reliability, and packaging. Attack those with the most iterations; the rest are
mechanical.

---

## H1–H4

Milestone breakdowns to be drafted when their horizon is next (scope lives in `DESIGN.md` →
*Product scope*). H1 = v1 useful builder; H2 = composition & ecosystem; H3 = reach/multimodal/
mobile; H4 = beyond software / robotics.

[`DESIGN.md`]: ./DESIGN.md
