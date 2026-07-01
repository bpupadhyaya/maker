# Maker — Design

This document captures *why* Maker is shaped the way it is. It is itself written in the
spirit of a Brief: what's **decided**, what we're **guessing**, and what's **open**.

## The premise

Every advance in computing has moved one boundary: the point where the human stops and the
machine takes over.

```
machine code   → human encodes everything, bit by bit
assembly       → human gets mnemonics
C              → human thinks in algorithms, forgets registers
Python         → human forgets memory
spreadsheets   → human thinks in their domain, not "programming"
LLM prompting  → human describes in language, machine writes code
Maker          → human just expresses — and the tool builds
```

The whole history is the machine absorbing more of the translation burden. Maker is the
endpoint: the meeting point lands at the human's *native* expression. The human never comes
down to the machine; the machine comes all the way up.

## The honest consequence

Remove the expression barrier and you don't get "everyone can build anything." You hit a
harder wall: **knowing what you want, precisely enough to build it.** Natural language,
drawing, and thought are all ambiguous *by design* — they work between humans only because
the listener fills the gaps with shared context.

So Maker cannot be a *compiler* (compilers demand precision). It must be a **collaborator**
whose core skill is turning fuzzy intent into something verifiable *through dialogue*. Two
burdens move off the human:

- **"Knowing what you left unsaid"** → now the tool's job (it detects the gaps that matter).
- **"Knowing what you want before you see it"** → now discovered (by reacting to a running
  thing).

A chat window makes you carry both. That difference is the whole invention.

## What Maker *is*

Not a programming language (the human never writes syntax). Not a passive tool (it has
judgment, asks, remembers, re-architects). It is an **agent / a maker** — and under the
hood, an orchestra of components (the AI collaborator, a synthesizer, a verifier, a runtime,
memory, per-device backends) unified behind one conversational face. The user must never see
the seams.

| Layer | What Maker is there |
|---|---|
| To you (surface) | a collaborator you converse with — a relationship |
| What it outputs | real, running, composable tools — *a tool that makes tools* |
| Inside (mechanism) | an orchestra of tools unified by one AI |
| Its one formal artifact | the **Brief** — the only "language," and Maker writes it, not you |

## The loop (a spiral, not a funnel)

Build the smallest working version, then keep interrogating, validating, refining, and
adding features. Each feature is one turn — the tool grows like tree rings.

```
   express ─▶ build smallest ─▶ react ─▶ interrogate ─▶ COMMIT ring 1  (it runs!)
                                                           │
                                                           ▼
            express "now add X" ─▶ build ─▶ react ─▶ commit ring 2  (still runs!)
                                                           │
                                                           ▼
            express "now add Y" ─▶ ... ─▶ commit ring 3
```

Three invariants:

1. **Always runnable** — every ring leaves a working tool, so `react` is available at every
   step.
2. **The Brief remembers every decision** — and uses it to catch contradictions across
   rings ("ring 2 committed *winner = points*, this new feature implies otherwise —
   reconcile?").
3. **Committed behaviors license fearless rebuilds** — iterative growth risks architectural
   debt; the accumulated behaviors form a regression net that lets Maker re-architect the
   internals freely when growth hits a wall. The same process that creates the debt
   generates the safety net to pay it off.

One rule that makes it feel smart: **how much to interrogate vs. just-build scales with the
cost of being wrong.** Cheap and reversible → build first, ask almost nothing. Expensive or
irreversible (deletes data, sends money, touches the real world) → interrogate more first.

## Presentation

The five steps are **internal grammar, never a UI.** Announcing "STEP 3: ITERATE" would
break the one thing the design rests on. Instead:

- Conversation in front; the living tool to poke; the Brief as the only exposed structure.
- The steps reveal themselves through Maker's *moves* ("here's a rough version — try it"),
  never labels.
- Orientation without a progress bar: the Brief's `open` list is the honest status, and
  **every Maker turn ends with the ball clearly in the user's court** (a question, or "try
  it").
- Scaffolding can flex to the person — a first-timer gets more narration; a power user gets
  near-pure conversation. Same five steps underneath.

## User interface — the layout (decided)

The UI renders exactly the three things the design exposes — **the conversation, the living
tool, the Brief** — and nothing that reads as a wizard or an IDE. It is a *workshop with a
conversation running through it*: not a chat app (the tool is a first-class object you poke, not
mere output), not an IDE (the human never writes code).

**It is one layout, not three.** Rather than choosing a centerpiece (conversation-primary vs
tool-primary vs conversation-only), the two regions sit on a **single conversation⇄tool
continuum** with one draggable divider:

```
"Talk" (conv wide)  ⟷  "Split"  ⟷  "Build" (tool wide)      →  narrow window collapses to
[ conversation | tool ]                                          single column + inline tool card
```

Decided mechanics:

- **One divider, not a grid.** Two regions (conversation | living tool) + the Brief as a
  compact docked strip. A single horizontal split spans the whole range — one dimension, never
  fiddly.
- **Three snap presets — Talk · Split · Build.** A non-developer clicks one word; a power user
  drags freely between them. No pixel-tuning required.
- **Conversation-favored default.** Maker's replies are substantial (it relays what the tool
  did, asks, reflects the Brief), so the default sits slightly toward Talk — a cramped side rail
  is wrong.
- **Memory, with restraint.** Maker remembers the preferred split per-session and per-machine,
  and may *gently ease* toward Build when handing over a fresh tool to poke — but the user's
  manual set always wins and sticks (suggest, never seize).
- **Responsive collapse = the "conversation-only" mode for free.** Narrow the window (or on a
  phone) and the split collapses to a single conversation column with the tool as a summonable
  inline card. Not a separate design — what the continuum degrades to at small width.
- **The Brief is a slim, always-glanceable strip** that survives any split (so it can't be
  squeezed out when dragging toward Build), expanding to the full goal/decided/guesses/open card
  on demand. It is the honest-status replacement for the progress bar.
- **Code is available, not default.** The default view is the *running* tool; readable,
  ejectable code lives behind a "show me how it works" peek — non-developers never see it, power
  users can inspect/eject.
- **Room for future input modes.** Text first, with an obvious slot for speech (🎤) and sketch
  (✏️) so the surface needn't be redesigned when those arrive.

### Two front-ends over one headless engine (decided)

Maker ships **both a GUI and a terminal (TUI) front-end — both first-class**, not one as an
afterthought. They are thin clients over a single **headless, UI-agnostic engine** (the
conductor + orchestra). Decide this split from day one even if the GUI is built first, so
neither face is bolted on later.

- **GUI — primary/product.** The full workshop: conversation ⇄ living-tool continuum, the tool
  pokeable inline. Required for the non-developer audience and for the "living tool beside the
  conversation" design.
- **Terminal — first-class sibling.** Serves developers, headless/remote/SSH, CI, and the
  **lowest-end hardware** (the mission's hardest accessibility tier — a TUI is the lightest
  path). In TUI mode the living tool opens in the **system browser** instead of an embedded
  pane.
- **Performance bar: the terminal must feel as fast as the Claude CLI** — instant startup, no
  input lag, tokens streamed as they generate. Honest scope of that bar: it governs *harness
  responsiveness*, which is fully in our control; it does **not** mean local generation matches
  cloud speed — raw tokens/sec is bounded by the user's model + hardware, independent of the UI.

## The Brief — rendering & correction (decided)

The Brief is the one exposed structure, so how it's read and corrected is load-bearing. It must
be two contradictory things at once: **glanceable** (a slim strip you can ignore) and
**complete** (the full shared understanding you can audit). And correcting it must feel like
talking to a collaborator, not filling out a form — or the "no wizard" rule is broken.

**Rendering — two levels, four zones.** Collapsed = a slim strip: the **goal** + a count of
**open** items ("3 things I still need"). Expanded = the full card, four labeled zones:

- **Goal** — one line, what we're making.
- **Decided** — the committed behaviors (the regression net), in plain language.
- **Guesses** — visually flagged (amber/italic): "I assumed X."
- **Open** — the honest status; what Maker still needs. This list is the progress-bar
  replacement.

**Correction — three affordances, one pipeline.** The Brief is a **co-edited document where
Maker owns coherence:**

1. **Talk** (primary) — "no, winner is by points." The warm default.
2. **Tap a guess** (one-tap) — confirm/reject without typing a rebuttal.
3. **Edit the text directly** (precision/power) — click a line and rewrite it, like co-editing a
   doc.

All three feed the *same* understanding pipeline. Crucially, a user edit is an **expressed
intent, not a silent overwrite**: Maker validates it, reflects it back ("moved that to
Decided"), and writes it into the formal record. So *"Maker writes the Brief, not you"* stays
true at the level that matters (the formal/verifiable record) while the user gets full
expressive control at the surface.

**Care scales with the zone** (an application of "cost of being wrong"): edits to
Goal/Guesses/Open are absorbed directly; editing a **Decided** item touches the regression net,
so it **triggers the reconcile flow** ("you're changing a locked behavior that ring 2 depended
on — here's what shifts, confirm?") instead of silently accepting. Editing is allowed
everywhere; only the care differs.

**Decided folds away.** The behavioral net grows every ring, so `Decided` collapses to a count
by default ("14 behaviors locked in"), expandable, and only surfaces itself when a new ring
*contradicts* an old decision. It is a safety net, not a reading assignment.

**Two renderings, one source.** The Brief the user sees is a **plain-language projection** of a
richer internal record that holds the actual verification contracts/checks — same source of
truth: the user reads prose, the verifier reads the checks.

## Gap-detection — the ask-vs-guess default (decided)

Every request leaves infinite details unspecified. A chatbot either asks too much (an
interrogation) or asks nothing (builds confidently wrong). Maker must ask only the few questions
that change the build and sensibly guess the rest — so gap-detection is a **ranking** problem,
not an enumeration.

**Governing principle (decided): a wrong assumption usually wastes more time than a
clarification** — building down a wrong path must then be noticed, explained, and unwound, which
dwarfs a quick question. So **the default, when torn, is to ask-and-clarify** (a
careful-collaborator, not an eager-builder).

Made operational as expected time-cost — `cost(asking)` vs `P(wrong) × cost(fixing a wrong
guess)` — with one carve-out that keeps the default from becoming "always ask":

- **Carve-out — visibility.** When a wrong guess would be **trivially visible and reversible in
  the always-runnable tool** ("what color?" → pick one, they see it and say "no, blue"),
  *building* is faster than asking — a question there only adds a round-trip before there's
  anything to react to. So: **poking covers the visible; questions cover the invisible.** Guess
  freely about what the running tool will reveal; clarify first about what it won't (tax
  rounding, a delete policy, single- vs multi-user) — exactly the invisible/expensive class where
  a wrong assumption hides and compounds.

**Ask cheaply, so "ask more" never becomes a wizard:**

- **Propose-a-default** — every clarifier carries Maker's best guess ("I'll assume X — right, or
  something else?"). A question *and* a guess fused: one-tap accept keeps momentum, correction
  adjusts. This is Maker's default asking shape, not bare open-ended questions.
- **Batch, don't drip** — the few clarifiers go in one turn ("quick check on 2 things"), never a
  sequence of single questions (drip-questioning is what *feels* like an interrogation).
- **Multiple-choice when possible** — offer the likely options; answering is a tap, not an essay.
- **Volume stays bounded** — the tiebreaker flipped to asking, but the ceiling didn't: only
  unknowns that change the build get asked; the trivial rest still gets a silent labeled guess.

**Mechanism (so a small local model can do this):** don't rely on raw model intuition — retrieve
**gap-archetype checklists** per tool-kind (any "list" tool → sort/empty-state/duplicates/
persistence; any "money" tool → currency/rounding/refunds), the "component library, not new
syntax" idea applied to *questions*. And **ask-by-building** — where cost is low, show two
variants in the running tool instead of asking.

**Dialable + decaying:** ask-and-clarify is the *default*, not a straitjacket — a power user can
say "just build, I'll react" and Maker leans eager for them; **memory** removes anything asked or
decided once, so the question set shrinks per user over time.

## Verification without a precise spec (decided)

The user never wrote a spec, so what does Maker check the tool against? The danger is a wrong
tool that *looks* right — especially for the invisible logic gap-detection told us to clarify
about. "It works" can't just be Maker's opinion.

**The circularity trap:** the same model writes the tool *and* the checks, so a wrong
understanding yields a wrong tool with a matching wrong check — both green, both wrong.

**The break — checks come from the user's words, not the model's inference.** Derive checks from
what the user *said, confirmed, or exemplified*; user-authored truth isn't circular. Sources,
strongest first:

1. **Examples the user gives** ("if two tie at 10, higher time wins") → concrete **case checks**.
   Gold — precise ground truth volunteered by reacting.
2. **Confirmed proposed-defaults** ("I'll assume X — right?" → yes) → a **ratified check**.
3. **Decisions/reactions** ("no, winner by points") → a **behavioral check**.

Every check is **ratified in plain language** before it counts ("I'll make sure winner is always
by points — that a rule? ✓"). A ratified check is trustworthy; a silently model-inferred one is
not.

**The Brief's `Decided` zone *is* the regression suite** — built conversationally, no spec ever
written. Four kinds of check: **case** (input→expected, from examples; strongest), **property/
invariant** ("total never negative"), **behavioral/UI** ("clicking Add shows the item"), and a
**smoke** check ("it launches, main flow doesn't crash" — the always-runnable baseline).

**Runs offline.** Because the substrate is web/TS and the tool is always-runnable, the verifier
component **drives the tool locally** (headless or in the webview) plus logic-layer checks — no
cloud. **Each ring: build → run the whole accumulated net → green commits, red fixes-or-
reconciles.** This is invariant #3 made real: verification is the engine that licenses fearless
re-architecting.

**Reducing residual circularity:** derive checks in a pass distinct from code-synthesis where
possible (independent perspective), and **surface a violation as a concrete reproduction, not a
red X** ("here — two players tie and it picks the wrong one") so the user sees the failure, not a
test report.

**What the user sees:** checks are **invisible by default** (in the internal record behind the
plain-language `Decided` line), surfacing only at **derivation** ("locked: winner by points ✓")
and **violation** (the concrete repro above). Power users can "show me the checks," which are
**ejectable** (real tests taken with the code). Non-developers feel the net through Maker's moves
(confident commits, contradiction catches), never as a test file.

**Honest limits (Maker states them):** coverage = only what the user reacted to, so the Brief
tracks **verified vs. assumed** and Maker says what it *hasn't* checked ("verified scoring; not
the export — want me to?"). Subjective intent ("make it feel friendly") can't be a check — it
stays in the poke-and-react loop. A small local model derives weaker checks than frontier — a
place optional-connect earns its keep (strengthen derivation on request).

## Composition & memory across tools (decided)

The goal: tools building on tools, and Maker remembering the user, their past tools, and their
taste — so each new tool starts from everything already made.

**Composition.** Every tool exposes a **contract** derived from its Brief (what it does / its
data / its interface). A new tool composes by *referencing* that contract; **Maker wires it
conversationally** ("use my expense tracker's data here") — the user never sees an import. Unit
of reuse = **whole tools with declared contracts**, plus Maker **factoring out a shared behavior**
into a reusable piece when it notices the same thing being rebuilt. All local (web/TS module/
service wiring in the Maker home) — composition works fully offline.

**Memory — three local layers** (privacy is free; nothing leaves the device):

1. **You** — taste, preferences, conventions.
2. **Your tools** — the whole corpus built so far (what composition draws from).
3. **Decisions & patterns** — ratified behaviors reusable across tools.

**Taste = accumulated ratified decisions applied as defaults** — the same behavioral net that
shrinks gap-detection's questions and seeds verification's checks, now spanning *tools* rather
than just rings. Memory is not a separate feature; it's the net crossing tool boundaries.

**Reuse is proactive — offered, never presumed (decided).** Maker actively notices reuse
opportunities and raises them unprompted ("this looks like your tracker — start from that?"),
but as a **propose-a-default the user confirms** before it's applied. Silently reusing the *wrong*
pattern would be a costly wrong assumption — exactly what ask-and-clarify guards against — so this
is the decided *proactivity* behavior aimed at reuse, not silent auto-reuse. Accept repeatedly →
it becomes more automatic; decline → Maker backs off (learning taste).

**Two guardrails:**

- **Cross-tool breakage is caught by verification.** If tool A composes tool B and B changes, A's
  checks flag it ("this change to B breaks A") — the regression net and the Brief's
  contradiction-catching extend *across tools*, not only across rings.
- **Learned taste stays a labeled guess, never a hardened assumption** — memory-defaults surface
  as guesses the user can override, and the Maker home (including memory) is **exportable/movable**
  to a new machine, consistent with the ejectable-ownership ethos.

## Always-on behaviors

Present in every step, this is what makes Maker feel human rather than like a wizard:

- **Honesty** — guesses are labeled; "this part is risky / I'm unsure" is said out loud.
- **Proactivity** — flags concerns before you ask ("this will delete real data — confirm?").
- **Restraint** — never asks what it can reasonably guess; never guesses what's costly to
  get wrong.
- **Always-runnable** — there's always a working tool to poke.
- **Memory** — nothing said once needs saying twice.

## On the name

We landed on **Maker** deliberately. It is the plainest description of the category we
converged on ("a maker you work with"), it carries zero jargon, and it tells the whole story
of where programming has gone: **`make` → `maker`**. The trade is clarity and lineage over
legal ownability — "Maker" is descriptive and a crowded brand field (MakerDAO, Make.com, the
Maker Movement), so distinctiveness is anchored with a qualified handle and the positioning
*"the AI-age successor to `make`,"* rather than the bare word.

## Distribution & install — local-first (decided)

**The mandate:** Maker is a **100% on-device tool.** Its whole job is to let anyone —
non-developer or developer — build real software (web, mobile, and later robotics and beyond)
with zero coding, like Claude Code or Codex, **except that Maker stays entirely on the user's
device and works 100% offline.**

The rule that anchors everything:

- **After the initial download, Maker must always work 100% offline.** No network, no account,
  no cloud dependency to build and run tools.
- **Optional, additive online capabilities are allowed** — stronger cloud AI, extra knowledge
  sources, libraries, external capabilities — but they are strictly opt-in, off by default, and
  never required. Turning them all off must never break the core loop.
- **Initial install may download well-known open-source components** (a local model, build
  toolchains, common libraries). That's the one online moment. After it, offline is guaranteed.

### The install model: install the conductor, then provision the workshop

Three phases:

1. **Download (small, online).** A single native app — the conversational face + the orchestra
   conductor + the provisioner. Non-developers just download and open; no terminal, no config.
2. **First-run provisioning (the *only* required online step).** A guided setup — itself a
   conversation, not a wizard — fetches the heavy open-source pieces into a self-contained
   **Maker home** (`~/.maker/`):
   - **The brain** — a local LLM, auto-sized to detected hardware. **Fetched, never bundled**
     (see below).
   - **Build toolchains** — vendored OSS (web first: Node + a bundler; Android SDK and others
     fetched on-demand later).
   - **The runtime / sandbox** — what actually *runs* the tools Maker builds.
   - **A library cache** — common OSS dependencies pre-pulled so builds need no network.
3. **The offline gate (the trust moment).** Before declaring ready, Maker runs a self-check
   **with the network off**: it builds and runs a trivial tool end-to-end. Passing it is the
   explicit promise — *"you are now 100% offline-capable."* This is "always-runnable" applied to
   the install itself.

The provisioned workshop **is** the "per-device backend" named in the identity table; robotics
and other future backends plug in as additional provisioned modules in the same Maker home.

### The model is fetched, never bundled (decided)

Maker does **not** ship model weights inside the installer. The conductor app carries only a
**curated model catalog** — metadata (name, hardware tier, license, official source URL, pinned
checksum/version), not weights. First-run provisioning auto-selects the tier-matched default and
**downloads it from its official source** (HF / Ollama registry / etc.), verified against the
pinned checksum. Why:

- **Legal:** not bundling means Maker never *redistributes* weights, so each model's license
  governs the user's own download — sidestepping the redistribution audit entirely and allowing
  even models with restrictive redistribution terms.
- **Size:** the installer stays tens of MB, not tens of GB.
- **Fit:** the model is chosen for the *detected* machine, not pre-guessed.
- **Free:** official sources host the weights; Maker pays no bandwidth/hosting.
- **Swappable:** matches the "model is a component" design; the catalog can refresh online
  (optional) so better defaults appear without an app update.

Non-negotiables so this doesn't betray the offline / non-developer / low-connectivity promises:

- **Guided one-tap, not a chore.** In-app, resumable, progress-shown ("Maker will set up your
  brain (~5GB) — the only time it needs internet"). The user never sees HuggingFace.
- **Sideload fallback (first-class, mission-critical).** Get the model via USB / SD / local
  mirror / a friend, then point Maker at the file (checksum-verified). Consider a "Maker + model
  on a USB stick" distribution for low-connectivity regions. "Download" must never assume
  broadband — the required-online-once step must never become "can never start."
- **Integrity.** Pinned checksums/signatures guard the weight-download supply chain; the catalog
  insulates against upstream renames/removals.

### Distribution shape (decided)

- **Primary:** prebuilt native installers — **macOS / Windows / Linux desktop app**, one-click
  for non-developers. **Desktop-first**, because it must host a model + toolchains + a runtime.
- **Optional:** a **build-from-source** path (it's MIT + on GitHub) for developers who want to
  compile the conductor and point it at their own models/toolchains.
- **Later:** a **mobile thin client** that pairs to a desktop workshop; full offline
  app-building is a desktop capability, not a phone one.

### Honest constraints (call these out, don't discover them)

- **Offline quality < online quality — unavoidably.** A local model that fits on a laptop can't
  match cloud frontier models on hard apps. The optional "connect once for a sharper result" is
  the pressure valve, and Maker should be honest about it *in the moment* ("I can do this
  locally, or get a sharper result if you let me reach out — your call").
- **Hardware tiers are real.** Desktop (16–32GB+ RAM) is the true target; a phone realistically
  runs a much smaller model or pairs to a desktop. Don't promise full offline app-building on a
  phone.
- **Mobile builds have a hard wall:** Android builds offline fine once the SDK is cached, but
  **iOS requires a Mac + Xcode** (Apple's rule) — can't be bypassed offline on Windows/Linux.

### Still open here

- Which models go in the curated catalog, and the hardware-tier → model mapping.
- The on-demand mobile-toolchain flow (esp. the iOS/Mac path).
- The phone thin-client ↔ desktop-workshop pairing protocol.
- Update/versioning of the local model and toolchains without breaking offline guarantees.

## Product scope — end to end (the whole arc)

The full product, not just v1. **North star:** the best *free, offline, on-device* maker — reached
through conversation, building tools (and tools that build tools) with zero coding, for everyone,
starting with software and ending as a general maker across domains including robotics. The scope
grows along several axes at once; the horizons below sequence them.

**Axes of the complete product**

- **Interaction surface:** text → GUI + TUI → voice (🎤) → sketch (✏️) → (ambient/thought, far).
- **What it builds (output domains):** local web/data/automation tools → full personal apps →
  mobile apps → desktop apps → integrations/services → robotics/physical → other domains.
- **Engine capabilities:** the five steps (Understand→Build→Iterate→Hand off→Evolve) · the Brief ·
  gap-detection · verification · composition · memory — each deepening every horizon.
- **Platforms Maker runs on:** desktop (macOS/Linux/Windows) → mobile thin client → embedded.
- **Intelligence:** tiered local models → optional cloud connect → a steadily rising offline floor.
- **Ecosystem:** install → per-tool artifacts → offline capability packs → tool sharing/composition
  → a privacy-preserving commons.

**Horizons** (each leaves a coherent, shippable whole; later horizons presuppose earlier ones)

- **H0 — Foundation (engine skeleton).** Headless TS engine with clean interfaces; basic
  conversation loop (Understand→Build→Iterate); one working pluggable inference backend; Brief v0
  (goal/decided/guesses/open); always-runnable web/TS substrate + runtime + sandbox; minimal Tauri
  GUI (conversation + living-tool webview + Brief strip) and minimal TUI; offline install +
  provisioning + offline gate. *Exit:* converse → a running small web tool → iterate one ring → it
  persists, fully offline.
- **H1 — v1 "useful builder" (the shippable slice).** Solid spiral with commit-per-ring;
  gap-detection v1 (ask-and-clarify, propose-a-default, archetype checklists); verification v1
  (user-derived ratified checks each ring); memory v1 (you / your tools / taste-as-defaults);
  hand-off (name, document, reusable); model catalog + fetch-not-bundle + sideload; both
  front-ends polished with the Talk/Split/Build continuum. **Tool scope: local web/data/automation
  & personal tools.** *Exit:* a non-developer builds a genuinely useful personal tool offline,
  free, end to end.
- **H2 — Composition & the tool ecosystem.** Tools building on tools (contracts + conversational
  wiring + proactive-offer reuse); cross-tool verification & contradiction-catching; a local
  library of tools + capability modules; downloadable offline capability packs (OSS libs,
  templates, archetypes); tool export/sharing (code + Brief + checks travel together); the Evolve
  step matured. *Exit:* tools compound — the Nth tool starts from everything already made.
- **H3 — Reach & richness.** Multimodal input (local voice, sketch→tool); broader output (richer
  apps, mobile — Android offline / iOS via Mac, desktop apps); mobile thin client paired to the
  desktop workshop; the optional-connect ecosystem (cloud AI, knowledge sources, external
  capabilities — all opt-in); local-model auto-upgrade without breaking the offline guarantee.
  *Exit:* Maker builds across form factors and meets the user at more of their native expression.
- **H4 — Beyond software (the platform vision).** A robotics backend (emit to ROS/Python/C++/
  real-time; the workshop provisions a robotics runtime) and other domains (hardware, data
  science, scientific/agentic tools); "tools that build tools" fully realized (Maker builds its
  own extensions); optionally a shared, privacy-preserving commons. *Exit:* a general on-device
  maker across domains — the AI-age `make` for anything buildable.

**Cross-cutting, every horizon (never traded away):** offline-first after download · privacy
(all-local) · MIT/open · the always-on behaviors (honesty, proactivity, restraint,
always-runnable, memory) · ejectable ownership · accessibility (low-end hardware + low-connectivity
sideload).

**Non-goals / boundaries:** not a programming language (no human syntax) · not a cloud SaaS
(local-first; cloud is opt-in only) · not a passive one-shot generator (it's a collaborator that
remembers and re-architects) · not a frontier-model chase (goal is best *free+offline*, not
beating cloud) · does not require an account, subscription, or connectivity to do its core job.

**Honest dependencies & risks across the arc:** local-model quality (rising, but the hard 20%
leans on optional-connect) · the unglamorous cross-platform packaging/provisioning grind ·
gap-detection quality on small models · iOS's Mac+Xcode wall · over-scope (breadth, not the core
idea, is the main failure mode) — so each horizon must ship a coherent whole before the next.

## Implementation stack (planned — revisable)

The first build-facing choice. Marked *planned*, not decided: these are the strongest current
bets, chosen to satisfy the constraints already locked (offline/local-first, small + low-end-
hardware-friendly, GUI + Terminal over one headless engine, tools built in TS/web). Cross-
platform target: **macOS, Linux/Unix, Windows.**

| Layer | Planned choice | Beat | Decisive reason |
|---|---|---|---|
| **Headless engine** | **TypeScript** (Node or Bun) | Rust, Go, Python | **Substrate unification** — same language/types as the TS/web tools it builds, so verifier/composition/runtime have no FFI boundary with the artifact. Engine is I/O-bound (heavy compute is in the model subprocess), so Rust's perf edge barely shows |
| **GUI shell** | **Tauri** (Rust host + OS webview) | Electron, Flutter, Qt/native, PWA | Only option that keeps a **web/TS UI** *and* a **small low-RAM native binary** (OS webview, no bundled Chromium). The living-tool pane is naturally a webview |
| **GUI frontend** | **Svelte/Solid** (or React) | React/Vue/vanilla | Compile-away frameworks = lighter webview for weak hardware. *Contestable* — React if velocity > leanness. Least load-bearing pick |
| **Terminal (TUI)** | **Ink** (TypeScript) | ratatui, Bubbletea, Textual | Same language as engine (thin client, no FFI) + Claude CLI *is* Ink → literal reference for the "as fast as Claude CLI" bar |
| **Generated-tool runtime** | **Bun** (Node fallback) | Node, Deno | One fast binary = runtime + bundler + pkg-mgr → fewer offline-provisioned pieces, faster cold builds for the spiral loop. Trade: Bun maturity vs Node |
| **Local inference** | **Pluggable** — llama.cpp default · **MLX on Mac** · Ollama optional | own engine, single backend, Python vLLM | Hardware heterogeneity is the game — fastest engine differs per platform (MLX fastest on Apple Silicon). Pluggable = the design's "per-device backends" |

**The cascade.** These aren't independent: the **engine language choice cascades** (TS engine →
Ink TUI + Bun/Node runtime; a Rust engine → ratatui TUI + a sidecar runtime, losing substrate
unification). Everything else is deliberately **swappable behind the headless engine** — which is
exactly why React-vs-Svelte and Bun-vs-Node can stay open without risk.

**The one non-negotiable:** keep the **engine headless with clean interfaces** from day one, so
the GUI, the TUI, and any future Rust rewrite of the hot paths are all thin clients over it.

**The alternative stack (if the lean/low-end/robotics axis dominates):** Rust core + Tauri +
ratatui TUI + a Node/Bun sidecar only to run generated tools. Smallest/fastest single-binary
engine and a natural path to systems/robotics backends — but much slower to build, smaller talent
pool, and it *loses substrate unification*. Not recommended as the v1 starting point; reachable
later via Maker's own "fearless rebuild" ethos, migrating hot paths behind the same interfaces.

## Open questions

These are named but not yet designed — the load-bearing ones:

- **The Brief's exact anatomy.** It carries a lot: goal, decisions, labeled guesses, open
  questions, *and* the behavioral net. What are its fields and how does it update each ring?
- **Gap-detection.** How does Maker know *which* of the infinite unspecified details
  actually matter — so it asks the 1–2 questions that change the build and guesses the rest?
  This is what makes Maker a collaborator instead of a chatbot, and it's the part nobody has
  cracked.
- **Verification you can trust** when the user never wrote a precise spec — turning
  reactions and decisions into checks (examples/contracts) automatically, for the user to
  confirm.
- **Composition & memory** — tools building on tools; Maker remembering you, your past
  tools, and your taste so each new tool starts from everything you've already made.
