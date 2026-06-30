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
- **Always-on behaviors:** honesty about guesses, proactivity on risk, restraint in asking,
  always-runnable, memory.
- **Name rationale:** chose clarity + the `make → maker` lineage over trademark ownability
  ("Maker" is descriptive and a crowded brand field — anchor distinctiveness with a
  qualified handle + the "successor to `make`" positioning).

## Open questions — the next design work

1. **The Brief's exact anatomy** + how it updates each ring. It's the one exposed structure,
   so it's highest priority.
2. **Gap-detection:** how Maker knows *which* unspecified details matter — ask the 1–2 that
   change the build, guess the rest. This is what makes Maker a collaborator, not a chatbot.
3. **Verification** without a precise spec — auto-derive checks (examples/contracts) from the
   user's reactions and decisions, for them to confirm.
4. **Composition & memory** across tools — tools building on tools; Maker remembering the
   user, their past tools, and their taste.

## Working style for this project

Design-first, conversational, iterative. The user thinks in small incremental steps and
prefers crisp, opinionated exchanges with honest pushback over exhaustive surveys.
