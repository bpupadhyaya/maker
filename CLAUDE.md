# Maker — context for Claude

Maker is an AI-native **"maker"**: an AI collaborator you reach through ordinary
conversation that builds *tools* for you. Positioned as the **AI-age successor to Unix
`make`** — `make` builds programs from a Makefile; Maker builds tools from a conversation.

**Read first:** [`README.md`](README.md) (overview) and [`docs/DESIGN.md`](docs/DESIGN.md)
(full rationale, with explicit *decided* vs *open*). This file is quick orientation;
`DESIGN.md` is the source of truth.

## Status

Early — **design phase, no code yet.** Name decided: **Maker**. Repo:
`github.com/bpupadhyaya/maker` (MIT, © 2026 Bhim Upadhyaya).

## What's decided

- **Identity:** not a programming language, not a passive tool — an **agent / a maker**. Under
  the hood an orchestra of components (LLM collaborator + synthesizer + verifier + runtime +
  memory + per-device backends) behind one conversational face. The user never sees the seams.
- **Surface:** the interface is **conversation** (typed text first; drawing/speech/thought
  later). The formal representation — the **Brief** — moves *inside*; Maker writes it, the
  user only confirms.
- **Local-first (offline mandate):** Maker is a **100% on-device** tool — anyone (non-dev or
  dev) builds real software (web/mobile, later robotics) with zero coding, like Claude
  Code/Codex but **fully on the user's device and offline**. After the initial download it must
  **always work 100% offline**; online capabilities (cloud AI, knowledge, libraries) are
  strictly opt-in and additive, never required. Install = *download a small conductor app →
  guided first-run provisions a self-contained "Maker home" (`~/.maker/`: local model +
  toolchains + runtime + library cache) → a network-off self-check certifies offline-ready.*
  The **model is fetched, never bundled** — the app ships a curated catalog (metadata + pinned
  checksums), first run downloads the tier-matched default from its official source (guided,
  resumable) with a USB/sideload fallback for low-connectivity.
  **Desktop-first** (macOS/Windows/Linux); build-from-source optional; mobile is a thin client
  later. Honest limits: offline quality < cloud; hardware tiers are real; iOS builds still need
  a Mac + Xcode. Full detail in `DESIGN.md` → *Distribution & install*.
- **Five steps** (internal grammar, never shown as UI): **Understand → Build → Iterate → Hand
  off → Evolve**, felt only through how Maker talks.
- **The loop is a spiral:** build the smallest *runnable* version, then iterate one feature
  ("ring") at a time — react → refine → add → validate → commit. Invariants: (1) always
  runnable, (2) the Brief remembers every decision and catches cross-ring contradictions,
  (3) committed behaviors form a regression net that licenses fearless re-architecting.
- **Interrogate-vs-build ratio scales with the cost of being wrong** (cheap/reversible →
  build first, ask little; expensive/irreversible → interrogate first).
- **What the user sees:** the conversation + the living (runnable) tool + the **Brief**
  (goal / decided / labeled guesses / open). No wizard, no progress bar. Every Maker turn
  ends with the ball clearly in the user's court.
- **UI layout:** one layout, not three — conversation and living tool sit on a single
  conversation⇄tool **continuum** with one draggable divider and three snap presets
  (**Talk · Split · Build**), conversation-favored default, remembered per machine, collapsing
  to a single column + inline tool card on narrow/phone. Brief = slim always-glanceable strip.
  Code is available behind a "show me how it works" peek, never the default view. Slot reserved
  for future 🎤/✏️ input. (Detail in `DESIGN.md` → *User interface*.)
- **Two front-ends, one headless engine:** ships **both a GUI (primary) and a terminal/TUI
  (first-class sibling)** as thin clients over one UI-agnostic conductor. GUI = full workshop
  for non-devs; TUI = devs / headless / SSH / lowest-end hardware, with the living tool opening
  in the system browser. **Terminal must feel as fast as Claude CLI** (harness responsiveness —
  startup/streaming/no lag; raw model tokens/sec stays hardware-bounded).
- **Always-on behaviors:** honesty about guesses, proactivity on risk, restraint in asking,
  always-runnable, memory.
- **Name rationale:** chose clarity + the `make → maker` lineage over trademark ownability
  ("Maker" is descriptive and a crowded brand field — anchor distinctiveness with a
  qualified handle + the "successor to `make`" positioning).

## Open questions — the next design work

1. **The Brief's exact anatomy** + how it updates each ring. **Rendering & correction now
   decided** (4 zones goal/decided/guesses/open; slim strip ↔ full card; correct 3 ways —
   talk / tap-a-guess / edit-text, all absorbed as intent not overwrite; Decided folds to a
   count & reconciles on contradiction; user-facing Brief = plain-language projection of a
   richer record the verifier reads — see `DESIGN.md`). Still open: the exact fields/contracts
   of that internal record and its per-ring update semantics.
2. **Gap-detection:** how Maker knows *which* unspecified details matter. **Default now decided:
   ask-and-clarify** (careful-collaborator, not eager-builder) — governing principle: *a wrong
   assumption usually wastes more time than a clarification.* Carve-out: guess-and-label when the
   mistake is trivially visible/reversible in the always-runnable tool (poking covers the
   visible; questions cover the invisible). Ask cheaply — propose-a-default ("I'll assume X —
   right?"), batch, multiple-choice, volume-bounded; dialable ("just build") + memory-decaying.
   Mechanism = retrieved gap-archetype checklists per tool-kind + ask-by-building. Still open:
   the exact archetype library + ranking. See `DESIGN.md` → *Gap-detection*.
3. **Verification** without a precise spec — **decided:** checks are derived from the *user's*
   words (examples > confirmed-defaults > decisions), **ratified in plain language** (breaks the
   circularity where the model writes both tool and check). The Brief's `Decided` zone = the
   conversationally-built regression suite (case/property/behavioral/smoke), run offline each
   ring against the always-runnable tool = the fearless-rebuild engine. Invisible until derived
   or violated (violation shown as a concrete repro, not a red X); ejectable for power users;
   honest about verified-vs-assumed coverage. See `DESIGN.md` → *Verification*.
4. **Composition & memory** across tools — **decided:** tools expose a **contract** (from their
   Brief); new tools compose by referencing it, Maker wires it conversationally (no visible
   imports); reuse unit = whole tools + factored-out shared behaviors. **Memory = 3 local layers**
   (you / your tools / decisions-&-patterns); **taste = accumulated ratified decisions applied as
   defaults** (same net that shrinks gap-detection + seeds verification, spanning tools). **Reuse
   is proactive — offered via propose-a-default, never silently presumed.** Guardrails: cross-tool
   breakage caught by verification; learned taste stays a labeled guess; Maker home (incl. memory)
   exportable. See `DESIGN.md` → *Composition & memory*.

## Working style for this project

Design-first, conversational, iterative. The user thinks in small incremental steps and
prefers crisp, opinionated exchanges with honest pushback over exhaustive surveys.
