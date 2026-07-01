# Maker

**A maker — the AI-age successor to `make`.**

`make` builds *programs* from a *Makefile*.
**Maker** builds *tools* from a *conversation*.

---

## What it is

Maker is not a programming language and not a passive tool. It's a **maker you work
with** — an AI collaborator you reach through ordinary conversation, that coordinates a
hidden combination of tools behind the scenes and produces other tools as its output.

Think *general contractor*, not *hammer* and not *blueprint*: you describe what you want,
Maker coordinates every specialized step behind the scenes, shows you progress, and hands
you something that works.

For seventy years the programming language has been the interface between human and
machine, and the human always had to "come down" to the machine's level of precision.
Maker moves the meeting point all the way up to **how humans naturally express
themselves** — starting with typed natural language, and later drawing, speech, and
beyond. The formal representation doesn't disappear; it moves *inside*, where Maker writes
it and you only confirm it.

## How it works

Five steps the user never sees as steps — they're felt only through how Maker talks, the
way you can tell a good collaborator is "confirming" versus "building" without them
announcing it:

1. **Understand** — you express what you want; Maker recalls your context, reflects the
   gist back, and asks only the few questions that actually block progress.
2. **Build** — Maker makes the smallest version that *actually runs*.
3. **Iterate** — you react to the running tool; Maker refines, adds features, validates,
   and commits a working version each round. Spiral until you're happy.
4. **Hand off** — Maker names it, documents it, makes it reusable.
5. **Evolve** — you come back later; Maker remembers everything and builds on top.

Underneath all five, always on: **honesty about guesses, proactivity on risk, restraint in
asking, always-runnable, memory.**

## What you see

Just three things — no wizard, no progress bar:

- **The conversation** — the relationship, where all five steps happen unnamed.
- **The living tool** — always running, always pokeable. You learn by poking, not reading.
- **The Brief** — Maker's living, visible understanding: goal, decisions, *labeled* guesses,
  and open questions. The one piece of structure we expose, because it's the shared thing
  both sides point at — and what keeps the collaboration honest and correctable.

## Status

**Working — 100% on-device and offline, runs from source today.** The full product scope is
built: converse → a running web tool appears → iterate → it persists; it asks the few questions
that matter, verifies what it builds, remembers your taste, hands off ejectable tools, composes
tools together, and runs a local model — all offline. Both front-ends are usable: a **browser GUI**
and a **terminal (TUI)**. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the milestone ledger and the
short `needs-user` list (signed installers, the compiled Tauri window, real voice/mobile/robots).

## Install

> **Heads up:** signed native installers (`.dmg` / `.msi` / `.AppImage`) don't exist yet — they
> need code-signing certs + CI. **Until then, the way to install Maker is to clone this repo and
> run it.** (The code and Tauri packaging are done; only the signed build step is pending.)

**Requirements:** **Node ≥ 23.6** (Node 26 recommended — it runs the TypeScript sources natively,
no build step). No other install needed to start.

**Step 1 — clone:**

```sh
git clone https://github.com/bpupadhyaya/maker && cd maker
```

**Step 2 — run the installer.** It sets up **both** ways to launch Maker (a `maker` command **and**
a clickable **app icon**), and offers to download a model right away:

```sh
# macOS / Linux
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

**Step 3 — launch Maker any of these ways:**

- **App icon** — double-click **Maker** in *Applications* (macOS), your app menu (Linux), or the
  *Start Menu* (Windows).
- **Command** — `maker` (GUI in your browser) · `maker tui` (terminal) · `maker setup` (download a
  model).
- **Direct** (no install) — `node packages/gui/serve.ts` (GUI) or `node packages/tui/src/repl.ts`
  (TUI).

**Set up your model:** the installer offers to do it; otherwise run **`maker setup`**, type
**`/setup`** in the TUI, or click **⛁ Models → Download** in the GUI.
Maker detects your hardware, picks the right open-source model, downloads it into its own space,
and verifies it. **This is the only step that needs internet** — after it, Maker works fully
offline. You never type `brew`, `ollama`, or any shell command; you trigger setup, the app does
the rest.

Then just describe a tool ("build me a tip calculator") and start building. No account, no
subscription. On **Apple Silicon** Maker uses **MLX** for the fastest local inference; elsewhere
**llama.cpp**.

> Want to see the flow without downloading a model? Just run it — the default `echo` backend
> demonstrates the whole loop (questions, the Brief, `/setup`, tool-building) without a model.

*Native installers are coming* — the app is a [Tauri](https://tauri.app) shell around the same
GUI server, pending the signing/CI setup.

## Managing models

Models are stored in **Maker's own space** — `~/.maker/models` (override with `MAKER_HOME`) —
**never system-wide**, so they can't collide with other apps and can be removed cleanly to free
space.

- **GUI:** click **⛁ Models** to open the panel — see installed + available models, **Download**
  (with a progress bar), **Remove** to free space, **Use** to switch the active model, and your
  total disk usage.
- **TUI:** `/models` (list installed + available), `/use <id>` (switch), `/remove <id>` (delete to
  free space).

Want a clean slate without uninstalling the app? **Remove all data (reset)** — GUI: the **Danger
zone** button in the Models panel; TUI: `/reset yes` — wipes every model, tool, and memory under
`~/.maker`.

## Uninstall (complete cleanup)

Whichever way you installed, cleanup removes **all of Maker's data** — every downloaded model,
built tool, and memory under `~/.maker` — and reports the space freed. It does **not** touch Node
or Ollama (you installed those). Because Maker keeps its data in one folder, cleanup is simple.

### If you installed the app (`.dmg` / `.msi` / `.AppImage`)

Dragging the app to the Trash **leaves your models behind** — use the uninstaller for a complete
cleanup (it removes the app + `~/.maker` + the small macOS per-app files):

The macOS app **bundles this uninstaller** (at `Maker.app/Contents/Resources/uninstall.command`),
so you can always find it. Run it:

```sh
# macOS — double-click Uninstall Maker, or run:
bash scripts/uninstall.command       # add --yes to skip the prompt; DRY_RUN=1 to preview
```

Then Trash the downloaded `Maker*.dmg` from `~/Downloads`. *(Prefer to do it by hand? Trash
`/Applications/Maker.app`, then `rm -rf ~/.maker`.)* Windows/Linux app installers: remove Maker
from Apps/your package manager, then delete `~/.maker`.

### If you ran from source (via `scripts/install.sh`)

This removes the `maker` launcher, the app icon, and all app data:

```sh
# macOS / Linux
bash scripts/uninstall.sh          # asks to confirm; add --yes to skip

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1    # add -Yes to skip
```

That leaves nothing behind except the cloned repo — delete it to finish:

```sh
cd .. && rm -rf maker              # macOS / Linux
# Windows:  Remove-Item -Recurse -Force maker
```

Prefer to do it by hand? Complete removal is just: delete the launcher (`~/.local/bin/maker`, or
`%LOCALAPPDATA%\Maker\bin\maker.cmd` on Windows), delete `~/.maker`, and delete the repo folder.

## Model configuration

Maker needs one local model. There are **four ways** to provide it — all fully offline after
setup — and `/setup` auto-picks the best one for your machine:

| Option | How | When |
|---|---|---|
| **GGUF / llama.cpp** (default) | `/setup` downloads the model's `.gguf` weights directly | Needs only a one-time network connection — no other software |
| **Ollama** | `MAKER_BACKEND=ollama` — Maker runs `ollama pull` for you | If you already use [Ollama](https://ollama.com) |
| **MLX** (Apple Silicon) | Auto-selected on Macs; `MAKER_BACKEND=mlx` | Fastest local inference on Apple Silicon |
| **Sideload** | `MAKER_SIDELOAD=/path/to/model.gguf` | Low/no connectivity — get the file via USB/SD/a friend |

### Environment variables

| Var | Values | Meaning |
|---|---|---|
| `MAKER_BACKEND` | `echo` (default, no-model demo) · `ollama` · `llamacpp` · `mlx` | Which inference runtime to use |
| `MAKER_SIDELOAD` | path to a local `.gguf` | Install by copying a local file instead of downloading |
| `MAKER_HOME` | dir (default `~/.maker`) | Where models, tools, and memory live (app space) |
| `MAKER_GUI_PORT` | port (default `4319`) | Port for the GUI server |
| `MAKER_NO_OPEN` | set to any value | Don't auto-open the browser / living tool |

### Model catalog — 20 open-source options

`/setup` picks the **recommended** model for your RAM tier automatically; you can choose any
other. Every model is available via **Ollama** and **GGUF**; ✓ marks **MLX** (Apple Silicon)
availability. Exact GGUF URLs live in `packages/provision/src/catalog.ts`.

**Low tier (≈8–12 GB RAM)**

| Model | RAM | License | Ollama tag | MLX |
|---|---|---|---|---|
| **Qwen2.5-Coder 3B** ⭐ | 12 GB | Apache-2.0 | `qwen2.5-coder:3b` | ✓ |
| Qwen2.5-Coder 1.5B | 8 GB | Apache-2.0 | `qwen2.5-coder:1.5b` | ✓ |
| DeepSeek-Coder V2 Lite | 12 GB | MIT | `deepseek-coder-v2:16b` | ✓ |
| Phi-4 Mini | 10 GB | MIT | `phi4-mini` | ✓ |
| Llama 3.2 3B | 10 GB | Llama 3.2 | `llama3.2:3b` | ✓ |
| Gemma 2 2B | 8 GB | Gemma | `gemma2:2b` | ✓ |
| StarCoder2 3B | 10 GB | OpenRAIL-M | `starcoder2:3b` | — |

**Mid tier (≈16 GB RAM)**

| Model | RAM | License | Ollama tag | MLX |
|---|---|---|---|---|
| **Qwen2.5-Coder 7B** ⭐ | 16 GB | Apache-2.0 | `qwen2.5-coder:7b` | ✓ |
| Code Llama 7B | 16 GB | Llama 2 | `codellama:7b` | ✓ |
| Mistral 7B Instruct | 16 GB | Apache-2.0 | `mistral:7b` | ✓ |
| Llama 3.1 8B | 16 GB | Llama 3.1 | `llama3.1:8b` | ✓ |
| IBM Granite Code 8B | 16 GB | Apache-2.0 | `granite-code:8b` | — |
| Yi-Coder 9B | 20 GB | Apache-2.0 | `yi-coder:9b` | ✓ |

**High tier (≈32 GB RAM)**

| Model | RAM | License | Ollama tag | MLX |
|---|---|---|---|---|
| **Qwen2.5-Coder 14B** ⭐ | 32 GB | Apache-2.0 | `qwen2.5-coder:14b` | ✓ |
| Devstral Small (24B) | 32 GB | Apache-2.0 | `devstral` | ✓ |
| Codestral 22B | 32 GB | MNPL (non-commercial) | `codestral` | ✓ |
| Gemma 2 27B | 40 GB | Gemma | `gemma2:27b` | ✓ |
| StarCoder2 15B | 32 GB | OpenRAIL-M | `starcoder2:15b` | — |

**Workstation tier (≈48 GB+ RAM)**

| Model | RAM | License | Ollama tag | MLX |
|---|---|---|---|---|
| **Qwen2.5-Coder 32B** ⭐ | 48 GB | Apache-2.0 | `qwen2.5-coder:32b` | ✓ |
| Llama 3.3 70B | 64 GB | Llama 3.3 | `llama3.3:70b` | ✓ |

⭐ = recommended default for the tier. Licenses are noted honestly — most are permissive
(Apache-2.0 / MIT); a few (Codestral, Llama, Gemma) carry their own terms.

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — the *why*: the thinking behind every decision (decided vs. open).
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the milestone ledger (H0–H4 + the model P-series) and the
  `needs-user` list (external-resource items: signed installers, the live GUI window, real
  voice/mobile/robots).

## License

MIT © 2026 Bhim Upadhyaya
