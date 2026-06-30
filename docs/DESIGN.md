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
