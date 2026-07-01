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
interfaces + echo backend + tests) · ✅ M0.2 (Ollama `InferenceBackend`, HTTP-mocked, 10 tests
green offline) · ✅ M0.3 (terminal front-end — zero-dep readline REPL, thin client over the
engine; pure render/controller unit-tested; live REPL smoke-tested offline; 14 tests green) ·
✅ M0.4 (tool substrate + runtime + sandbox — `@maker/runtime` builds a web/TS tool to a
Maker-home dir and serves it on a loopback port via Node's built-in http, path-traversal
sandboxed; 19 tests green, verified with real local `fetch`, offline) · ✅ M0.5 (synthesis loop
— `synthesizeFiles()` parses the model's fenced code blocks → a ToolSpec; `createMaker()` wires
model → synthesize → build → run → `tool-running`, plus the iterate path; 23 tests green,
verified by fetching the served tool + confirming an iteration updates it, offline) · ✅ M0.6
(Brief v0 — `parseBriefBlock`/`mergeBrief`/`renderBrief`; the model may emit a reserved
```brief``` JSON block, the goal seeds from the first request, `brief-updated` events flow and
render as a panel in the REPL; 29 tests green offline) · ✅ M0.7 (persistence — `@maker/store`
file-based `MemoryStore` under `~/.maker`; `createMaker` persists Brief + tool files each turn
and `restore()` rebuilds+runs them; build→quit→restore verified by fetch; 32 tests green
offline) · 🟡 M0.8 (GUI — *partial*: the tested core is done — Talk/Split/Build layout continuum
+ view-model reducer, 37 tests green; web frontend (`web/`) + Tauri shell (`src-tauri/`)
scaffolded. **Live Tauri build is `needs-user`.**) · ✅ M0.9 (provisioning + offline gate + CI
matrix — `@maker/provision`: hardware detection, curated model catalog + tier selection,
sha256 integrity, and the **real offline gate** (build+run+`fetch` a tool with no network);
CI upgraded to the macOS/Windows/Linux matrix + a `release.yml` scaffold; 45 tests green
offline. Model download/signing/installers = `needs-user`).

### ✅ H0 COMPLETE — the Foundation is built.
Converse → a running web tool appears → iterate → it persists — **fully offline**, with a
working terminal front-end, a tested GUI core, local persistence, and a network-off release
gate. 45 tests, all offline, green on the CI matrix. Remaining `needs-user` items (real model,
Ink polish, live Tauri window, signed installers) are external-resource gated, not design gaps.
Next: **H1 (v1 useful builder).**

**Note on M0.3:** built on Node's built-in `readline` (zero deps) instead of Ink, so the
terminal front-end is real, runnable, and fully offline *today*. A richer **Ink-based** terminal
UI (Talk/Split/Build in the terminal) is deferred to a polish milestone (needs a network install
of Ink). Cross-package imports currently use relative paths (`../../engine/...`) until an
`npm install` wires the workspace symlinks; they can then switch to `@maker/engine`.

**`needs-user` (external resources I can't provision autonomously):**
- **M0.2 real-model check** — code-complete + mock-tested, but verifying a *real* offline
  completion needs `ollama` installed + a model pulled (`ollama pull qwen2.5-coder:7b`). Not on
  this machine.
- **M0.3 Ink polish** — the richer Ink terminal UI needs `npm install ink react` (network).
  Deferred; the readline REPL covers M0.3's acceptance today.
- **M0.8 live GUI** — the tested core + web/Tauri scaffold are in; running the actual window
  needs the Rust toolchain + Tauri CLI (`cargo tauri dev`) and the engine↔webview bridge (the
  `express` Tauri command in `src-tauri/src/main.rs`). Not installable in this sandbox.

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

## H1 — v1 useful builder

**Definition of done:** a non-developer builds a genuinely useful personal tool offline, free,
end to end — with Maker asking the *right* few questions, verifying what it built, remembering
taste, and handing off a named/documented tool.

**Progress:** ✅ M1.1 (gap-detection v1 — `classifyKind` + archetype checklists + `detectGaps`:
invisible/expensive gaps → propose-a-default clarifiers, bounded; visible/cheap → labeled
guesses; memory-skippable; 51 tests green offline) · ✅ M1.2 (verification v1 — serializable
checks (status/contains/notContains) from a smoke check + a reserved ```checks``` block;
`runChecks` fetches the running tool and evaluates them; violations report as concrete repros;
verified against the real runtime, 56 tests green offline).

| # | Milestone | Goal | Acceptance gate | Risk |
|---|---|---|---|---|
| **M1.1** | Gap-detection v1 | ask-and-clarify: classify kind → archetype gaps → clarifiers + guesses | ✅ done (51 tests) | med |
| **M1.2** | Verification v1 | serializable checks (smoke + ratified ```checks``` block); run each ring against the running tool; report violations | ✅ done (56 tests; violation caught vs real runtime, concrete repro) | high |
| **M1.3** | Taste-memory | record ratified decisions/taste in the store; apply as defaults → shrink gap-detection's questions over time | a decision made once isn't asked again (feeds `detectGaps` `known`) | med |
| **M1.4** | Hand-off | name the tool + generate a README; make it ejectable | build → hand-off produces a named dir with code + README + Brief | low |
| **M1.5** | Integrate + polish | wire gap-detection/verification/taste into `createMaker`; the TUI REPL builds real tools; front-ends render clarifiers | end-to-end: express → clarify → build → verify → persist, in the REPL | high |

## H2–H4

Milestone breakdowns to be drafted when their horizon is next (scope lives in `DESIGN.md` →
*Product scope*). H2 = composition & ecosystem; H3 = reach/multimodal/mobile; H4 = beyond
software / robotics.

[`DESIGN.md`]: ./DESIGN.md
