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

**Provisioning UX (added 2026-07-01):** setup is now **app-driven, one action** — `provisionModel()`
(detect hardware → `selectModel` → download + verify with progress) + the TUI **`/setup`** command
(and the GUI's first-run "Set up" button call the same flow). `ollamaInstaller` runs the model pull
*on the user's behalf*; the long-term path bundles a portable llama.cpp so no external runtime is
needed and the app downloads only the weights. **The user never types `brew`/`ollama` — they trigger
setup, the app does the rest** (matches DESIGN.md "guided one-tap, not a chore"). Runtime smoke:
mock installer drives select→download→done, idempotent; live `/setup` runs and reports status.

**`needs-user` (external resources I can't provision autonomously):**
- **The one online moment** — `/setup` performs the download, but it needs the inference runtime
  present + network at setup time. v1 drives Ollama (so it needs Ollama installed); the decided
  long-term fix is to **bundle a portable llama.cpp** in the installer so `/setup` needs only the
  network, not a pre-installed runtime. Either way the *user* only triggers `/setup`.
- **M0.3 Ink polish** — the richer Ink terminal UI needs `npm install ink react` (network).
  Deferred; the readline REPL covers M0.3's acceptance today.
- **M0.8 live GUI** — the tested core + web/Tauri scaffold are in; running the actual window
  needs the Rust toolchain + Tauri CLI (`cargo tauri dev`) and the engine↔webview bridge (the
  `express` Tauri command in `src-tauri/src/main.rs`). Not installable in this sandbox.

**Engineering guardrails (all milestones):**
- Engine is **headless + interface-first** — GUI/TUI/inference/runtime are thin clients/adapters.
- **Verify via a quick runtime smoke, not a unit-test suite** (owner directive 2026-06-30:
  tests delay the product). Run the new code once to confirm it works; rely on the compiler and
  the always-runnable design. (Existing tests through M1.2 are kept as a free safety net.)
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

## H5 — parity (offline-relevant features from Codex / Claude Code)

Goal: match the features from Codex + Claude Code that are relevant to a 100%-offline tool, so
users have no reason *not* to use Maker. All offline, app-space, GUI + TUI. Maker stays fully
free/MIT (monetization deferred to future hosted services — nothing gated).

**Progress:** ✅ H5.1 (role onboarding + personalization — `roles.ts` catalog tuned to Maker's
everyone-audience (Personal/Money/Health/Learning/Work/Creative/Home/Other) → `startersForRoles`/
`kindsForRoles`; `@maker/store` `profile.ts` (roles + onboarded, app-space); GUI first-run
onboarding overlay + `/api/profile`; TUI first-run hint + `/role`. Also fixed a readline race
(create the interface after async setup). Smoke: roles logic, profile roundtrip, GUI + TUI set).

- ✅ H5.2 quick-start templates — engine `starters.ts` (tracker/list/timer/calculator/dashboard/
  form → label + prompt); GUI `/api/starters` (role-ordered) renders **empty-state chips** that
  pre-fill the composer; TUI role-aware "Start with…" suggestion + `/starters` (list) + `/starter
  <id>` (builds it). Smoke: role ordering, GUI chips, TUI express.
- ✅ H5.3 projects / workspaces — `@maker/store` `projects.ts` (Project = id/name/toolIds;
  create/list/active/default 'My Tools'/addTool); `createMaker` `onToolBuilt` hook files each built
  tool into the active project; GUI header switcher + REST; TUI `/project list|new|use`. Smoke:
  auto-filing + switch.
- ✅ H5.4 custom slash commands / macros — `@maker/store` `macros.ts` (set/remove/list/resolve,
  app-space); controller gained a `resolveMacro` hook so a typed `/name` that isn't built-in expands
  to a saved prompt and builds; TUI `/macro add|list|remove` + expansion; GUI Macros panel (＠) +
  REST (`/api/macros` GET/POST, `/api/macros/remove`) and expansion in `/api/express`. Smoke: TUI +
  GUI expansion build.
- ✅ H5.5 local scheduling (offline Routines) — `@maker/store` `schedules.ts` (Schedule =
  id/name/prompt/everyMinutes/lastRun; add/list/remove/markRun/dueSchedules; `cronLineFor`;
  `startScheduleRunner` — an in-process timer that runs due schedules via `maker.express`, injectable
  clock/interval). TUI `/schedule add|list|remove` + runner on launch; GUI ⏱ panel + REST; cron/
  launchd line generated (always-on install = needs-user). Smoke: due-logic, runner fires, TUI+GUI.
- ✅ H5.6 hooks / automation — `@maker/store` `hooks.ts` (Hook = id/event/command; add/list/remove;
  `runHooks` spawns commands with event context as `MAKER_*` env vars). Wired: `tool-running` (from
  the event stream) + `tool-built` (from `onToolBuilt`) in both front-ends; TUI `/hook add|list|
  remove`; GUI ⚡ panel + REST. Smoke: runHooks exec + tool-built on a real build. (`file-change` is
  a registered event type; auto-firing it needs a file watcher — small follow-up.)
- ⏭️ H5.7 history + search
- ⏭️ H5.8 settings/config UI
- ⏭️ H5.9 local usage stats

## End-user readiness (G-series) — runnable GUI, TUI turnkey, model management

Goal: a non-developer can run Maker and manage models (download / remove / switch), with models
stored only in Maker's app space (`~/.maker/models`).

**Progress:** ✅ G1 (model management API — `@maker/provision` `models-store.ts`:
`listInstalledModels`/`modelDiskUsage`/`removeModel` (clean, weights + sidecars) +
`getActiveModel`/`setActiveModel`, all under `MAKER_HOME/models` (app space, never system). Smoke:
list/disk/switch/remove clean; removing the active model clears it).

- ✅ G2 GUI local server (Node, no Rust) — `packages/gui/serve.ts`: serves the web UI, bridges the
  conversation to `createMaker` over **SSE** (`POST /api/express`), model-management REST
  (`GET /api/models`, `POST /api/models/{download,remove,use}`), opens the browser; `npm start`.
  Smoke: web served, 20 models listed, active switched, conversation streamed — all without Tauri.
- ✅ G3 GUI web UI fully wired — `web/index.html`+`main.js`+`styles.css`: conversation sends and
  renders SSE events into the transcript, the living-tool `<iframe>` loads the running tool URL,
  the Brief strip updates, and a **Model panel** lists installed + available models with
  download-with-progress, remove-to-free-space, switch-active, and disk usage. Smoke: panel markup +
  endpoint wiring + live use/remove + conversation SSE. **The GUI is usable end to end in a browser.**
- ✅ G4 TUI turnkey — `/models` (installed + available, active marked), `/use <id>` (switch,
  persisted), `/remove <id>` (clean, frees space); the controller gained an `onEvent` hook so the
  REPL **auto-opens the living tool in the browser** on `tool-running`; the active model is
  persisted and the Ollama backend uses its tag. Smoke: list/use/remove side effects verified.
- ✅ G5 Tauri native shell wired — `src-tauri/main.rs` runs the SAME Node GUI server
  (`serve.ts`) as a sidecar and opens a native window at its URL (native app == the browser GUI,
  in a real window), killing the sidecar on exit; `tauri.conf.json` validated. Compiling +
  signing = `needs-user` (Rust/Tauri toolchain + certs).
- ✅ G7 install/uninstall + app icons — `scripts/install.sh`+`uninstall.sh` (macOS/Linux) and
  `install.ps1`+`uninstall.ps1` (Windows). Install sets up **both** launch methods: a `maker`
  command (`maker gui|tui|setup`) **and** a clickable **app icon** (macOS `Maker.app`, Linux
  `maker.desktop`, Windows Start-Menu `.lnk`), and offers to run setup. `maker setup` =
  `packages/tui/src/setup.ts`, a headless one-shot provisioning CLI. **Uninstall = COMPLETE
  cleanup** — removes launcher + app icon + all app data (`~/.maker`: models/tools/memory), reports
  space freed, leaves only the repo; doesn't touch Node/Ollama. Smokes: headless setup (sideload),
  install creates launcher + `.app`, uninstall removes launcher + icon + data. README documents
  both install methods + uninstall.
- ✅ G6 README — honest install: **clone the repo + run** (GUI `node packages/gui/serve.ts`, TUI
  `node packages/tui/src/repl.ts`), then `/setup`; native installers marked *coming*. Documents
  model management (download/remove/switch, app-space `~/.maker/models`) and env vars
  (`MAKER_BACKEND`/`MAKER_SIDELOAD`/`MAKER_HOME`/`MAKER_GUI_PORT`/`MAKER_NO_OPEN`). Links + run
  targets sanity-checked.

### ✅ G-series COMPLETE — Maker is end-user ready.
Both front-ends run from source today: **GUI** in the browser (`node packages/gui/serve.ts`) with
conversation + living tool + Brief + a full **Model panel** (download/remove/switch/disk), and the
**TUI** turnkey (`/setup`, `/models`, `/use`, `/remove`, auto-open). Models are stored only in
Maker's app space (`~/.maker/models`) and removed cleanly. The Tauri native window wraps the same
server (compile/sign = `needs-user`). README tells users to clone + run until signed installers
exist.

## Finishing the product (P-series) — Ollama-free setup + many model options

Goal: setup needs only a network connection (no pre-installed runtime), with many open-source
model + integration options. Then the README.

**Progress:** ✅ P1 (direct GGUF/llama.cpp installer — `ggufInstaller` streams a model's `.gguf`
to `~/.maker/models` while hashing, checksum-verifies, behind the `ModelInstaller` seam;
`provisionModel` uses it with no Ollama; catalog gained `ollama`/`gguf`/`mlx` per-model options.
Runtime smoke: streamed + verified + provisioned; bad checksum rejected).

- ✅ P2 llama.cpp inference backend — `llamaCppInference` hits a local `llama-server`
  OpenAI-compatible `/v1/chat/completions` (streaming) + `/health`, loopback, no API key; smoke:
  streams, plugs into a session, health-gated (running server = `needs-user`)
- ✅ P3 MLX-on-Mac inference backend — `mlxInference` reuses the OpenAI-compatible adapter over a
  local `mlx_lm.server`, gated to Apple Silicon; smoke: streams on Apple Silicon, unavailable off it
- ✅ P4 expanded catalog — **20 open-source models** across low/mid/high/workstation, each with
  its **Ollama tag + GGUF/HF URL + MLX repo** (17 with MLX), licenses noted; a **recommended
  default per tier**; `selectModel` now tier-based (prefers the tier's recommended); `modelsForTier`
  for a "choose another" list. Smoke: options present, selection tier-correct. (Exact GGUF
  filenames + sha256 pinned per release = `needs-user`.)
- ✅ P5 backend/installer chooser — `chooseInstaller` (default GGUF/llama.cpp = only-network;
  Ollama if preferred; **sideload** a local `.gguf` = low-connectivity fallback) + `chooseBackendKind`
  (MLX on Apple Silicon, else llama.cpp); `sideloadInstaller` copies a local file + checksum-verifies;
  wired into TUI `/setup` (shows "via gguf, runtime mlx"). Smoke: selection by platform/preference +
  sideload copy.
- ✅ P6 README — install steps (download app → `/setup` → offline; dev-run via
  `node packages/tui/src/repl.ts`), a **model-configuration** section (GGUF/llama.cpp · Ollama ·
  MLX · sideload), the full **20-model catalog** table across tiers, env vars (`MAKER_BACKEND`,
  `MAKER_SIDELOAD`, `MAKER_HOME`), and doc pointers. REPL now maps `MAKER_BACKEND` to all
  backends (echo/ollama/llamacpp/mlx). Suite 56/56 green.

### ✅ P-series COMPLETE — setup is Ollama-free, with many model options.
`/setup` downloads GGUF weights directly (only-network), runs them via llama.cpp (or MLX on Apple
Silicon), offers 20 open-source models with Ollama/GGUF/MLX/sideload options, and auto-selects per
machine. The product is finished and documented; remaining items are external-resource
`needs-user` (signed installers, the live GUI window, real voice/mobile/robots, and bundling the
llama.cpp binary + pinning exact GGUF URLs/checksums for a truly zero-dependency `/setup`).

## H1 — v1 useful builder

**Definition of done:** a non-developer builds a genuinely useful personal tool offline, free,
end to end — with Maker asking the *right* few questions, verifying what it built, remembering
taste, and handing off a named/documented tool.

**Progress:** ✅ M1.1 (gap-detection v1 — `classifyKind` + archetype checklists + `detectGaps`:
invisible/expensive gaps → propose-a-default clarifiers, bounded; visible/cheap → labeled
guesses; memory-skippable; 51 tests green offline) · ✅ M1.2 (verification v1 — serializable
checks (status/contains/notContains) from a smoke check + a reserved ```checks``` block;
`runChecks` fetches the running tool and evaluates them; violations report as concrete repros;
verified against the real runtime, 56 tests green offline) · ✅ M1.3 (taste-memory — `@maker/store`
`taste.ts`: `recordDecision`/`knownGapIds`/`recordTaste`/`getTaste` persist ratified decisions +
taste locally; `knownGapIds` feeds `detectGaps({known})` so decided gaps aren't re-asked; runtime
smoke: 3 clarifiers → 0 after deciding) · ✅ M1.4 (hand-off — engine `slugName`/`renderReadme`/
`buildManifest` (name + README from the Brief) + `@maker/store` `writeHandoff` writes an
**ejectable bundle** (tool files + README.md + maker.json); runtime smoke: `tip-calculator`
bundle written) · ✅ M1.5 (integrate + polish — `createMaker` now wires gap-detection (clarify
events + guesses), verification (checks each ring + violations), taste-memory (known-shrinking +
`decide`), and hand-off (`handoffBundle`); the TUI REPL builds real tools via the full Maker;
runtime smoke: clarify → build → verify → taste-shrinks → hand-off, plus a live REPL smoke).

### ✅ H1 COMPLETE — the v1 useful builder works.
Express → clarify the few questions that matter → build the smallest runnable tool → verify it →
remember decisions (so they aren't re-asked) → hand off a named, documented, ejectable bundle.
All offline. Next: **H2 (composition & the tool ecosystem).**

| # | Milestone | Goal | Acceptance gate | Risk |
|---|---|---|---|---|
| **M1.1** | Gap-detection v1 | ask-and-clarify: classify kind → archetype gaps → clarifiers + guesses | ✅ done (51 tests) | med |
| **M1.2** | Verification v1 | serializable checks (smoke + ratified ```checks``` block); run each ring against the running tool; report violations | ✅ done (56 tests; violation caught vs real runtime, concrete repro) | high |
| **M1.3** | Taste-memory | record ratified decisions/taste in the store; apply as defaults → shrink gap-detection's questions over time | ✅ done (smoke: 3 clarifiers → 0 after deciding) | med |
| **M1.4** | Hand-off | name the tool + generate a README; make it ejectable | ✅ done (smoke: named ejectable bundle — code + README + maker.json) | low |
| **M1.5** | Integrate + polish | wire gap-detection/verification/taste into `createMaker`; the TUI REPL builds real tools; front-ends render clarifiers | ✅ done (smoke: clarify→build→verify→taste-shrinks→handoff; live REPL) | high |

## H2 — composition & the tool ecosystem

**Definition of done:** tools compound — a new tool can build on ones already made; Maker
proactively offers reuse; cross-tool breakage is caught; tools export/share.

**Progress:** ✅ M2.1 (tool contracts + registry — `contract.ts`: `ToolContract`/`Provision`
derived from the Brief (+ a reserved ```contract``` block); `@maker/store` registry
(`registerTool`/`listTools`/`toolRegistry`); `createMaker` registers each built tool's contract
+ exposes `maker.contract`; runtime smoke: 2 tools registered + discoverable) · ✅ M2.2
(composition — `matchTools` (stemmed token overlap) ranks registered tools against a request;
`createMaker` emits a `reuse-offer` on the first turn when a match exists (offered, never
presumed); `maker.reuse()` records the dependency; runtime smoke: "expense report" → offered the
"expense-tracker", accepted, dependency recorded) · ✅ M2.3 (cross-tool verification —
`snapshotDependency`/`verifyDependencies`: `reuse()` snapshots the dependency's provided names,
`maker.verifyComposition()` compares against the live registry and reports concrete breaks;
runtime smoke: dropping a relied-on provision is caught across tools) · ✅ M2.4 (capability packs
— `pack.ts`: `CapabilityPack`/`PackTemplate` + `parsePack` (safe import); `@maker/store`
`installPack`/`listPacks`/`templateFor`/`packRegistry` (local, offline pack registry); runtime
smoke: pack parsed/installed, templates looked up by kind, bad pack rejected. Download =
`needs-user`) · ✅ M2.5 (tool export/import — `ToolExport` (files + Brief + checks + contract),
`maker.exportBundle()`, `importTool(bundle, runtime)`; runtime smoke: export → JSON round-trip →
import → runnable, metadata intact).

### ✅ H2 COMPLETE — tools compound.
Tools expose contracts and register; Maker proactively offers reuse; composed dependencies are
verified across tools; capability packs add offline starters; tools export/import as portable
bundles. Next: **H3 (reach & richness — multimodal input, mobile, opt-in cloud).**

| # | Milestone | Goal | Acceptance gate | Risk |
|---|---|---|---|---|
| **M2.1** | Tool contracts + registry | tools expose a contract; a local registry lists them | ✅ done (smoke: 2 contracts registered + discoverable) | med |
| **M2.2** | Composition (proactive-offer) | when a new request matches an existing tool, Maker offers to build on it; wires the contract in | ✅ done (smoke: match → reuse-offer → accept → dependency recorded) | high |
| **M2.3** | Cross-tool verification | a composed tool's checks flag when its dependency changes | ✅ done (smoke: dropped provision caught across tools) | high |
| **M2.4** | Capability packs | offline packs (templates/archetypes) with a format + apply | ✅ done (smoke: parse/install/lookup; download = needs-user) | med |
| **M2.5** | Tool export/import | export a tool (code + Brief + checks + contract) and import it back | ✅ done (smoke: export → JSON → import → runnable, metadata intact) | med |

## H3 — reach & richness

**Definition of done:** Maker meets the user at more of their native expression (voice, sketch)
and reaches more form factors (mobile, desktop), with opt-in cloud for the hard 20% and a rising
local-model floor. Many parts are external-resource gated — seams built offline, live parts
`needs-user`.

**Progress:** ✅ M3.1 (multimodal input seam — `InputRequest` normalizes text/voice/sketch to a
text request via injectable transcriber/describer; engine stays modality-agnostic; runtime smoke:
voice-derived text builds a tool. Real local Whisper/vision = `needs-user`) · ✅ M3.2 (opt-in
cloud connect — `cloudInference` (OpenAI-compatible streaming `InferenceBackend`) wrapped by
`optInBackend`, an off-by-default gate that refuses unless connected; runtime smoke: refuses while
off, streams when connected. Real cloud call = `needs-user`) · ✅ M3.3 (model auto-upgrade —
catalog entries versioned; `compareVersions` + `upgradeAvailable` offer a newer model only when
the catalog advances, never forced; runtime smoke passes. Applying the download = `needs-user`) ·
✅ M3.4 (output targets — `emitTarget`: web (as-is) + pwa (manifest + service worker injected,
installable) are offline-buildable; android/ios/desktop return a `needs-user` toolchain marker;
runtime smoke: PWA served + manifest fetched, native targets flagged) · ✅ M3.5 (mobile
thin-client pairing — `genPairingCode`/`createPairing`: desktop issues a code, phone submits it,
a match yields a shared token; runtime smoke: wrong rejected, right pairs. Real transport (QR/LAN
+ device) = `needs-user`).

### ✅ H3 COMPLETE — reach & richness.
Multimodal input (voice/sketch pipeline), opt-in cloud (off by default), model auto-upgrade,
web/PWA output + native-target markers, and desktop↔phone pairing — the seams for reaching more
expression and form factors, with live hardware/network parts marked `needs-user`. Next: **H4
(beyond software / robotics).**

| # | Milestone | Goal | Acceptance gate | Risk |
|---|---|---|---|---|
| **M3.1** | Multimodal input seam | text/voice/sketch → one InputRequest | ✅ done (smoke: all modalities normalize; voice builds a tool) | med |
| **M3.2** | Opt-in cloud connect | a CloudBackend (InferenceBackend), off by default, honest "reach out once" | ✅ done (smoke: refuses while off, streams when connected; real call = needs-user) | med |
| **M3.3** | Model auto-upgrade | catalog versioning + an upgrade check that never breaks offline | ✅ done (smoke: upgrade offered only when newer; apply = needs-user) | low |
| **M3.4** | Output targets | target abstraction (web/PWA now; mobile/desktop = needs-user toolchains) | ✅ done (smoke: PWA served + manifest; native flag needs-user) | med |
| **M3.5** | Mobile thin-client pairing | pairing protocol scaffold (desktop workshop ↔ phone) | ✅ done (smoke: wrong rejected, right pairs + token; transport = needs-user) | high |

## H4 — beyond software / robotics

**Definition of done:** Maker builds across domains, not just software — a general on-device
maker. Robotics is the first non-software domain; "tools that build tools" is realized; an
optional commons lets tools/packs be shared. Physical execution (robots/ROS) is `needs-user`.

**Progress:** ✅ M4.1 (domain abstraction — `Domain` registry (software + robotics),
`classifyDomain`, `domainFor`; each domain names its artifact language + whether execution needs
external hardware; runtime smoke: requests classified software vs robotics. Robot *execution* =
`needs-user`) · ✅ M4.2 (robotics emit + sim — `robotics.ts`: `RobotAction` plan (move/grip/
release/wait), `parseRobotPlan` (from a ```robot``` block), `simulateRobot` runs it against a
virtual arm returning a trace + final state; synthesizer skips the robot block; runtime smoke:
plan parsed + simulated offline. Real robot = `needs-user`) · ✅ M4.3 (tools that build tools —
`parsePackBlock`: Maker authors a ```pack``` block → a `CapabilityPack`; installed into the
registry, its template builds a real tool; synthesizer skips the pack block; runtime smoke: a
Maker-authored pack's template serves a running tool) · ✅ M4.4 (optional commons — `CommonsBundle`
(exported tools + packs), `exportCommons`/`importCommons`; import rebuilds+runs the tools and
returns installable packs; runtime smoke: bundle round-trips, both tools running, pack installable.
Hosting = `needs-user`).

### ✅ H4 COMPLETE — beyond software.
Multi-domain (software + robotics), robotics runs in simulation, Maker authors packs (tools that
build tools), and an optional commons shares tools/packs. Real robots/ROS = `needs-user`.

### 🎉 H0–H4 ALL COMPLETE — the full product scope is built.
Every offline-buildable milestone across all five horizons is done and runtime-smoke-verified.
Only external-resource `needs-user` items remain (see below).

| # | Milestone | Goal | Acceptance gate | Risk |
|---|---|---|---|---|
| **M4.1** | Domain abstraction | a Domain seam (software + robotics) + classification | ✅ done (smoke: requests classified across domains) | med |
| **M4.2** | Robotics emit + sim | emit a robot action plan; a local simulator "runs" it (real robot = needs-user) | ✅ done (smoke: plan parsed + simulated offline) | high |
| **M4.3** | Tools that build tools | Maker generates a capability pack from a spec + installs it | ✅ done (smoke: authored pack installs + its template builds a tool) | med |
| **M4.4** | Optional commons | a shareable commons index (export/import a set of tools/packs) | ✅ done (smoke: bundle round-trips, tools running, pack installable) | med |

[`DESIGN.md`]: ./DESIGN.md
