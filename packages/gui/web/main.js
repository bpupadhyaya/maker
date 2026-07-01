// Maker GUI — the browser UI over the local server (packages/gui/serve.ts).
// Conversation streams from /api/express (SSE); the living tool renders in an
// iframe; the Brief updates from events; the Model panel drives the model REST.

const PRESET_FRACTIONS = { talk: 0.7, split: 0.55, build: 0.32 };
const COLLAPSE_WIDTH = 640;

const $ = (sel) => document.querySelector(sel);
const workspace = $("#workspace");
const transcript = $("#transcript");
const briefGoal = $(".brief-goal");
const briefOpen = $(".brief-open");
const toolframe = $("#toolframe");
const toolEmpty = $("#tool-empty");

// ---------- layout ----------
function applyLayout(preset) {
  document.documentElement.style.setProperty("--conv-fraction", String(PRESET_FRACTIONS[preset] ?? 0.55));
  for (const b of document.querySelectorAll(".presets button")) b.classList.toggle("active", b.dataset.preset === preset);
}
function applyResponsive() {
  workspace.classList.toggle("collapsed", window.innerWidth < COLLAPSE_WIDTH);
}
for (const b of document.querySelectorAll(".presets button")) b.addEventListener("click", () => applyLayout(b.dataset.preset));
window.addEventListener("resize", applyResponsive);
applyLayout("split");
applyResponsive();

// ---------- rendering ----------
function addTurn(role, text) {
  if (role === "user") hideStarters();
  const el = document.createElement("div");
  el.className = "turn " + role;
  el.textContent = text;
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

// ---------- quick-start chips ----------
function hideStarters() {
  const s = document.getElementById("starters");
  if (s) s.hidden = true;
}
async function loadStarters() {
  const data = await (await fetch("/api/starters")).json();
  const box = document.getElementById("starters");
  box.innerHTML = '<div class="starters-title">Start with…</div>';
  const row = document.createElement("div");
  row.className = "starters-row";
  for (const s of data.starters) {
    const b = document.createElement("button");
    b.className = "starter-chip";
    b.textContent = s.label;
    b.title = s.prompt;
    b.addEventListener("click", () => {
      const input = $("#input");
      input.value = s.prompt;
      input.focus();
    });
    row.appendChild(b);
  }
  box.appendChild(row);
}
loadStarters();

// ---------- projects ----------
async function loadProjects() {
  const data = await (await fetch("/api/projects")).json();
  const sel = $("#project-select");
  sel.innerHTML = "";
  for (const p of data.projects) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.name} (${p.toolIds.length})`;
    if (p.id === data.active) o.selected = true;
    sel.appendChild(o);
  }
}
$("#project-select").addEventListener("change", async (e) => {
  await post("/api/projects/use", { id: e.target.value });
});
$("#project-new").addEventListener("click", async () => {
  const name = prompt("New project name:");
  if (!name) return;
  await post("/api/projects", { name });
  loadProjects();
});
loadProjects();
function renderBrief(brief) {
  briefGoal.textContent = "Goal: " + (brief.goal || "(not set yet)");
  briefOpen.textContent = (brief.open?.length ?? 0) + " open";
}
function showTool(url) {
  toolframe.src = url;
  toolEmpty.style.display = "none";
}

// ---------- conversation (SSE) ----------
async function express(request) {
  addTurn("user", request);
  let streamEl = null;
  const res = await fetch("/api/express", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      handleEvent(ev, () => (streamEl ??= addTurn("assistant", "")), (el) => (streamEl = el));
    }
  }
}

function handleEvent(ev, ensureStream, setStream) {
  switch (ev.type) {
    case "assistant-delta": {
      const el = ensureStream();
      el.textContent += ev.text;
      transcript.scrollTop = transcript.scrollHeight;
      break;
    }
    case "assistant-done":
      setStream(null);
      break;
    case "brief-updated":
      renderBrief(ev.brief);
      break;
    case "clarify":
      for (const c of ev.clarifiers) addTurn("clarify", "? " + c.prompt);
      break;
    case "reuse-offer":
      for (const m of ev.matches) addTurn("clarify", "↻ " + m.why + " — build on it?");
      break;
    case "tool-running":
      showTool(ev.url);
      break;
    case "checks-run":
      if (ev.violations?.length) for (const v of ev.violations) addTurn("error", v);
      else addTurn("ok", "✓ " + (ev.results?.length ?? 0) + " checks passed");
      break;
    case "error":
      addTurn("error", ev.message);
      break;
  }
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#input");
  const text = input.value.trim();
  input.value = "";
  if (text) express(text).catch((err) => addTurn("error", String(err)));
});

// ---------- onboarding (first run) ----------
let profileRoles = [];
async function initProfile() {
  const p = await (await fetch("/api/profile")).json();
  profileRoles = p.roles || [];
  if (!p.onboarded) showOnboarding(p.availableRoles);
}
function showOnboarding(available) {
  const box = $("#onboarding");
  const chips = $("#role-chips");
  const chosen = new Set();
  chips.innerHTML = "";
  for (const r of available) {
    const b = document.createElement("button");
    b.className = "role-chip";
    b.innerHTML = `<b>${r.label}</b><span class="muted">${r.blurb}</span>`;
    b.addEventListener("click", () => {
      if (chosen.has(r.id)) { chosen.delete(r.id); b.classList.remove("on"); }
      else { chosen.add(r.id); b.classList.add("on"); }
    });
    chips.appendChild(b);
  }
  box.hidden = false;
  const finish = async (roles) => {
    await post("/api/profile/roles", { roles });
    profileRoles = roles;
    box.hidden = true;
  };
  $("#onboard-continue").onclick = () => finish([...chosen]);
  $("#onboard-skip").onclick = () => finish([]);
}
initProfile();

// ---------- model panel ----------
const panel = $("#models-panel");
const scrim = $("#scrim");
function openPanel() { panel.hidden = false; scrim.hidden = false; loadModels(); }
function closePanel() { panel.hidden = true; scrim.hidden = true; }
$("#models-btn").addEventListener("click", openPanel);
$("#models-close").addEventListener("click", closePanel);
scrim.addEventListener("click", closePanel);
$("#remove-all").addEventListener("click", async () => {
  if (!confirm("Remove ALL downloaded models to free space?")) return;
  await post("/api/models/remove-all", {});
  loadModels();
});
$("#reset-all").addEventListener("click", async () => {
  if (!confirm("Remove ALL data — every model, tool, and memory (~/.maker)? This cannot be undone.")) return;
  const r = await (await post("/api/reset", {})).json();
  addTurn("ok", "✓ Reset complete — freed " + fmtGB(r.freedBytes || 0) + ". Fresh start; run /setup to add a model.");
  loadModels();
});

function fmtGB(bytes) { return (bytes / 1024 ** 3).toFixed(1) + " GB"; }

async function loadModels() {
  const data = await (await fetch("/api/models")).json();
  $("#disk-usage").textContent = "Disk used: " + fmtGB(data.diskUsageBytes || 0);

  const removeAllBtn = $("#remove-all");
  removeAllBtn.hidden = data.installed.length === 0;

  const installedIds = new Set(data.installed.map((m) => m.id));
  const inst = $("#installed-list");
  inst.innerHTML = data.installed.length ? "" : '<p class="muted">none yet</p>';
  for (const m of data.installed) {
    const row = document.createElement("div");
    row.className = "model-row" + (data.active === m.id ? " active" : "");
    row.innerHTML = `<span class="m-name">${m.name}</span><span class="muted">${fmtGB(m.sizeBytes)}</span>`;
    const use = button(data.active === m.id ? "Active" : "Use", async () => { await post("/api/models/use", { id: m.id }); loadModels(); });
    use.disabled = data.active === m.id;
    const rm = button("Remove", async () => { await post("/api/models/remove", { id: m.id }); loadModels(); });
    rm.className = "danger";
    row.append(use, rm);
    inst.appendChild(row);
  }

  const avail = $("#available-list");
  avail.innerHTML = "";
  for (const m of data.available) {
    const row = document.createElement("div");
    row.className = "model-row";
    const rec = m.recommended ? " ⭐" : "";
    row.innerHTML = `<span class="m-name">${m.name}${rec}</span><span class="muted">${m.tier} · ${m.approxSizeGB}GB · ${m.license}</span>`;
    if (installedIds.has(m.id)) {
      const tag = document.createElement("span");
      tag.className = "muted"; tag.textContent = "installed";
      row.appendChild(tag);
    } else {
      const prog = document.createElement("div"); prog.className = "prog"; prog.hidden = true;
      const bar = document.createElement("div"); bar.className = "prog-bar"; prog.appendChild(bar);
      const dl = button("Download", () => downloadModel(m.id, prog, bar));
      row.append(dl, prog);
    }
    avail.appendChild(row);
  }
}

async function downloadModel(id, prog, bar) {
  prog.hidden = false;
  const res = await fetch("/api/models/download", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, nl).split("\n").find((l) => l.startsWith("data:"));
      buf = buf.slice(nl + 2);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (typeof msg.ratio === "number") bar.style.width = Math.round(msg.ratio * 100) + "%";
      if (msg.error) addTurn("error", "Download failed: " + msg.error);
    }
  }
  loadModels();
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
async function post(url, body) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
