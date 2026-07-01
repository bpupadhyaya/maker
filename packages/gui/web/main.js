// Maker GUI — thin DOM layer over the tested core (@maker/gui: layout +
// view-model). M0.8 scaffold: the layout continuum + rendering are wired; the
// bridge to the engine is a Tauri command (needs-user: Rust/Tauri toolchain to
// run). When bundled, imports resolve to @maker/gui; inlined here so the static
// scaffold opens without a build step.

const PRESET_FRACTIONS = { talk: 0.7, split: 0.55, build: 0.32 };
const COLLAPSE_WIDTH = 640;

const workspace = document.getElementById("workspace");
const transcript = document.getElementById("transcript");
const briefGoal = document.querySelector(".brief-goal");
const briefOpen = document.querySelector(".brief-open");
const toolframe = document.getElementById("toolframe");
const toolEmpty = document.getElementById("tool-empty");

function applyLayout(preset) {
  document.documentElement.style.setProperty(
    "--conv-fraction",
    String(PRESET_FRACTIONS[preset] ?? 0.55),
  );
  for (const b of document.querySelectorAll(".presets button")) {
    b.classList.toggle("active", b.dataset.preset === preset);
  }
}
function applyResponsive() {
  workspace.classList.toggle("collapsed", window.innerWidth < COLLAPSE_WIDTH);
}
for (const b of document.querySelectorAll(".presets button")) {
  b.addEventListener("click", () => applyLayout(b.dataset.preset));
}
window.addEventListener("resize", applyResponsive);
applyLayout("split");
applyResponsive();

// --- rendering (mirrors @maker/gui view-model) ---
function appendTurn(role, text) {
  const el = document.createElement("div");
  el.className = role;
  el.textContent = text;
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
}
function renderBrief(brief) {
  briefGoal.textContent = "Goal: " + (brief.goal || "(not set yet)");
  briefOpen.textContent = (brief.open?.length ?? 0) + " open";
}
function showTool(url) {
  toolframe.src = url;
  toolEmpty.style.display = "none";
}

// --- engine bridge (Tauri command) — needs-user to run ---
async function express(request) {
  appendTurn("user", request);
  if (!window.__TAURI__) {
    appendTurn(
      "assistant",
      "(scaffold) Engine bridge not wired yet — build with the Tauri toolchain to make this live.",
    );
    return;
  }
  // Streams MakerEvents from the Rust side over @maker/engine.
  await window.__TAURI__.core.invoke("express", { request });
}

document.getElementById("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (text) express(text);
  input.value = "";
});

// Exposed so a future Tauri event listener can feed MakerEvents in.
window.maker = { appendTurn, renderBrief, showTool };
