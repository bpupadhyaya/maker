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

// ---------- image attachments (vision) ----------
let pendingImages = []; // data URIs to send with the next message
function renderAttachments() {
  const box = document.getElementById("attachments");
  box.innerHTML = "";
  pendingImages.forEach((uri, i) => {
    const chip = document.createElement("span");
    chip.className = "att-chip";
    const img = document.createElement("img");
    img.src = uri;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "✕";
    rm.title = "Remove";
    rm.addEventListener("click", () => { pendingImages.splice(i, 1); renderAttachments(); });
    chip.append(img, rm);
    box.appendChild(chip);
  });
}
function addImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => { pendingImages.push(String(reader.result)); renderAttachments(); };
  reader.readAsDataURL(file);
}
document.getElementById("attach-btn").addEventListener("click", () => document.getElementById("file-input").click());
document.getElementById("file-input").addEventListener("change", (e) => {
  for (const f of e.target.files) addImageFile(f);
  e.target.value = "";
});
$("#input").addEventListener("paste", (e) => {
  for (const item of e.clipboardData?.items ?? []) {
    if (item.type.startsWith("image/")) addImageFile(item.getAsFile());
  }
});
const conv = document.getElementById("conversation");
conv.addEventListener("dragover", (e) => { e.preventDefault(); });
conv.addEventListener("drop", (e) => {
  e.preventDefault();
  for (const f of e.dataTransfer?.files ?? []) addImageFile(f);
});

// ---------- conversation (SSE) ----------
async function express(request) {
  addTurn("user", pendingImages.length ? `${request}  [${pendingImages.length} image(s)]` : request);
  const images = pendingImages;
  pendingImages = [];
  renderAttachments();
  let streamEl = null;
  const res = await fetch("/api/express", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request, images }),
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
  let text = input.value.trim();
  input.value = "";
  // Allow sending just an image (no text) — default to a describe prompt.
  if (!text && pendingImages.length) text = "What's in this image?";
  if (!text) return;
  // "save [the project] [in|to <folder>]" → the permission-gated save flow,
  // NOT the model (small models just say "I can't access files").
  const save = /^\s*(?:please\s+)?save\b(?:\s+(?:the\s+)?(?:project|tool|it|this|files?))?(?:\s+(?:in|to|into|at)\s+(.+?))?\s*$/i.exec(text);
  if (save && !text.startsWith("/")) {
    const base = (save[1] || "~/Downloads").trim().replace(/\/+$/, "");
    addTurn("user", text);
    saveTo(`${base}/${toolSlug()}`, false);
    return;
  }
  // "read / analyze / review … <folder path>" → permission-gated folder read.
  const readVerb = /\b(read|analy[sz]e|review|summari[sz]e|inspect|explain|go through|look (?:at|through)|what'?s in)\b/i.test(text);
  const pathTok = text.match(/(?:^|\s)(~[^\s]+|\/[^\s]+)/);
  if (readVerb && pathTok && !text.startsWith("/")) {
    addTurn("user", text);
    readAnalyze(pathTok[1].trim(), text, false);
    return;
  }
  // approvalMode: "ask" confirms before building (interrogate more).
  if (settings.approvalMode === "ask" && !text.startsWith("/") && !confirm("Build: " + text + " ?")) return;
  express(text).catch((err) => addTurn("error", String(err)));
});

// ---------- settings ----------
let settings = { model: "", effort: "medium", theme: "dark", approvalMode: "auto" };
const settingsPanel = $("#settings-panel");
function applyTheme() { document.documentElement.setAttribute("data-theme", settings.theme); }
async function loadSettings() {
  settings = await (await fetch("/api/settings")).json();
  applyTheme();
  $("#set-effort").value = settings.effort;
  $("#set-theme").value = settings.theme;
  $("#set-approval").value = settings.approvalMode;
}
async function saveSetting(key, value) {
  settings = await (await post("/api/settings", { key, value })).json();
  applyTheme();
}
function openSettings() { settingsPanel.hidden = false; scrim.hidden = false; loadSettings(); }
function closeSettings() { settingsPanel.hidden = true; scrim.hidden = true; }
$("#settings-btn").addEventListener("click", openSettings);
$("#settings-close").addEventListener("click", closeSettings);
$("#set-effort").addEventListener("change", (e) => saveSetting("effort", e.target.value));
$("#set-theme").addEventListener("change", (e) => saveSetting("theme", e.target.value));
$("#set-approval").addEventListener("change", (e) => saveSetting("approvalMode", e.target.value));
loadSettings();

// ---------- save the current tool (with permission, like Claude Code) ----------
function toolSlug() {
  let goal = ($(".brief-goal")?.textContent || "").replace(/^Goal:\s*/i, "").trim();
  if (/^\(?not set/i.test(goal)) goal = ""; // ignore the "(not set yet)" placeholder
  const s = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return s || "my-tool";
}
// Permission card (Claude-Code-style): Allow once / Always allow <folder> / Deny.
function showPermissionCard(dir, parent, verbPhrase, onAllow, denyMsg) {
  const el = document.createElement("div");
  el.className = "turn permission";
  const q = document.createElement("div");
  q.innerHTML = `🔒 Maker wants to ${verbPhrase}:<br><code>${dir}</code><br>Allow?`;
  const row = document.createElement("div");
  row.className = "perm-actions";
  const allowOnce = button("Allow once", async () => { el.remove(); await onAllow(true); });
  const always = button(`Always allow ${parent}`, async () => { el.remove(); await post("/api/permissions/grant", { dir: parent }); await onAllow(false); });
  const deny = button("Deny", () => { el.remove(); addTurn("assistant", denyMsg); });
  deny.className = "danger";
  row.append(allowOnce, always, deny);
  el.append(q, row);
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
}

async function saveTo(dir, force) {
  const res = await (await post("/api/save", { dir, force: !!force })).json();
  if (res.path) { addTurn("ok", "✓ Saved your tool to " + res.path); return; }
  if (res.needsPermission) {
    showPermissionCard(res.dir, res.parent, "create and write files in",
      (f) => saveTo(dir, f),
      "Okay — nothing written. You can Allow the folder later, or use ⬇ Save.");
    return;
  }
  addTurn("error", res.error || "Couldn't save — build a tool first.");
}

// Read a local folder (with permission) and analyze it with the model.
async function chatStream(request) {
  const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request }) });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", el = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, nl); buf = buf.slice(nl + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === "assistant-delta") { if (!el) el = addTurn("assistant", ""); el.textContent += ev.text; transcript.scrollTop = transcript.scrollHeight; }
      else if (ev.type === "error") addTurn("error", ev.message);
    }
  }
}
async function readAnalyze(dir, userText, force) {
  const res = await (await post("/api/read", { dir, force: !!force })).json();
  if (res.needsPermission) {
    showPermissionCard(res.dir, res.parent, "read the files in",
      (f) => readAnalyze(dir, userText, f),
      `Okay — I won't read ${dir}. I can only analyze folders you allow, or content you paste here. Next: Allow the folder, or paste the files/text you want me to look at.`);
    return;
  }
  if (res.error) { addTurn("error", `Couldn't read ${dir}: ${res.error}. (Is the path right?)`); return; }
  const files = res.files || [];
  if (!files.length) { addTurn("assistant", `${dir} has no readable text files to analyze.`); return; }
  addTurn("assistant", `Read ${files.length} file(s) from ${dir}. Analyzing…`);
  const ctx = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  await chatStream(`${userText}\n\nHere are the files from ${dir} (${files.length}):\n\n${ctx}`);
}

$("#export-btn").addEventListener("click", () => {
  const dir = prompt("Save the current tool to which folder?", "~/Downloads/" + toolSlug());
  if (dir) saveTo(dir, false);
});

// ---------- usage stats ----------
const statsPanel = $("#stats-panel");
function openStats() { statsPanel.hidden = false; scrim.hidden = false; loadStats(); }
function closeStats() { statsPanel.hidden = true; scrim.hidden = true; }
$("#stats-btn").addEventListener("click", openStats);
$("#stats-close").addEventListener("click", closeStats);
async function loadStats() {
  const s = await (await fetch("/api/stats")).json();
  const cells = [
    ["Sessions", s.sessions],
    ["Tools built", s.toolsBuilt],
    ["Active days", s.activeDays],
    ["Tokens (est)", "~" + s.tokens],
  ];
  $("#stats-grid").innerHTML =
    cells.map(([k, v]) => `<div class="stat"><div class="stat-val">${v}</div><div class="stat-key">${k}</div></div>`).join("") +
    (s.since ? `<p class="muted">since ${s.since}</p>` : "");
}

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
scrim.addEventListener("click", () => { closePanel(); closeMacros(); closeSched(); closeHooks(); closeSearch(); closeSettings(); closeStats(); });
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

// ---------- macros panel ----------
const macrosPanel = $("#macros-panel");
function openMacros() { macrosPanel.hidden = false; scrim.hidden = false; loadMacros(); }
function closeMacros() { macrosPanel.hidden = true; scrim.hidden = true; }
$("#macros-btn").addEventListener("click", openMacros);
$("#macros-close").addEventListener("click", closeMacros);
async function loadMacros() {
  const data = await (await fetch("/api/macros")).json();
  const list = $("#macros-list");
  list.innerHTML = data.macros.length ? "" : '<p class="muted">No macros yet.</p>';
  for (const m of data.macros) {
    const row = document.createElement("div");
    row.className = "model-row";
    const name = document.createElement("span");
    name.className = "m-name";
    name.innerHTML = `<b>/${m.name}</b> → ${m.prompt}`;
    const rm = button("Remove", async () => { await post("/api/macros/remove", { name: m.name }); loadMacros(); });
    rm.className = "danger";
    row.append(name, rm);
    list.appendChild(row);
  }
}
$("#macro-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#macro-name").value.trim().replace(/^\//, "");
  const prompt = $("#macro-prompt").value.trim();
  if (!name || !prompt) return;
  await post("/api/macros", { name, prompt });
  $("#macro-name").value = "";
  $("#macro-prompt").value = "";
  loadMacros();
});

// ---------- schedules panel ----------
const schedPanel = $("#sched-panel");
function openSched() { schedPanel.hidden = false; scrim.hidden = false; loadSchedules(); }
function closeSched() { schedPanel.hidden = true; scrim.hidden = true; }
$("#sched-btn").addEventListener("click", openSched);
$("#sched-close").addEventListener("click", closeSched);
async function loadSchedules() {
  const data = await (await fetch("/api/schedules")).json();
  const list = $("#sched-list");
  list.innerHTML = data.schedules.length ? "" : '<p class="muted">No schedules yet.</p>';
  for (const s of data.schedules) {
    const row = document.createElement("div");
    row.className = "model-row";
    const name = document.createElement("span");
    name.className = "m-name";
    name.innerHTML = `every <b>${s.everyMinutes}m</b> — ${s.prompt}<br><code>${s.cron}</code>`;
    const rm = button("Remove", async () => { await post("/api/schedules/remove", { id: s.id }); loadSchedules(); });
    rm.className = "danger";
    row.append(name, rm);
    list.appendChild(row);
  }
}
$("#sched-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const everyMinutes = Number($("#sched-every").value);
  const prompt = $("#sched-prompt").value.trim();
  if (!everyMinutes || !prompt) return;
  await post("/api/schedules", { everyMinutes, prompt });
  $("#sched-every").value = "";
  $("#sched-prompt").value = "";
  loadSchedules();
});

// ---------- hooks panel ----------
const hooksPanel = $("#hooks-panel");
function openHooks() { hooksPanel.hidden = false; scrim.hidden = false; loadHooks(); }
function closeHooks() { hooksPanel.hidden = true; scrim.hidden = true; }
$("#hooks-btn").addEventListener("click", openHooks);
$("#hooks-close").addEventListener("click", closeHooks);
async function loadHooks() {
  const data = await (await fetch("/api/hooks")).json();
  const list = $("#hooks-list");
  list.innerHTML = data.hooks.length ? "" : '<p class="muted">No hooks yet.</p>';
  for (const h of data.hooks) {
    const row = document.createElement("div");
    row.className = "model-row";
    const name = document.createElement("span");
    name.className = "m-name";
    name.innerHTML = `on <b>${h.event}</b> → <code>${h.command}</code>`;
    const rm = button("Remove", async () => { await post("/api/hooks/remove", { id: h.id }); loadHooks(); });
    rm.className = "danger";
    row.append(name, rm);
    list.appendChild(row);
  }
}
$("#hook-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const event = $("#hook-event").value;
  const command = $("#hook-command").value.trim();
  if (!command) return;
  await post("/api/hooks", { event, command });
  $("#hook-command").value = "";
  loadHooks();
});

// ---------- history & search panel ----------
const searchPanel = $("#search-panel");
function openSearch() { searchPanel.hidden = false; scrim.hidden = false; loadRecent(); $("#search-results").innerHTML = ""; }
function closeSearch() { searchPanel.hidden = true; scrim.hidden = true; }
$("#search-btn").addEventListener("click", openSearch);
$("#search-close").addEventListener("click", closeSearch);
async function loadRecent() {
  const data = await (await fetch("/api/history")).json();
  const box = $("#history-recent");
  box.innerHTML = "";
  const rows = [
    ...data.prompts.slice(-8).reverse().map((p) => ({ kind: "prompt", text: p })),
    ...data.tools.map((t) => ({ kind: "tool", text: `${t.name} — ${t.goal}` })),
  ];
  if (!rows.length) { box.innerHTML = '<p class="muted">Nothing yet.</p>'; return; }
  for (const r of rows) box.appendChild(hitRow(r));
}
function hitRow(h) {
  const row = document.createElement("div");
  row.className = "model-row";
  row.innerHTML = `<span class="m-name"><span class="muted">[${h.kind}]</span> ${h.text}</span>`;
  return row;
}
$("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#search-input").value.trim();
  const box = $("#search-results");
  if (!q) { box.innerHTML = ""; return; }
  const data = await (await fetch("/api/search?q=" + encodeURIComponent(q))).json();
  box.innerHTML = data.hits.length ? "" : '<p class="muted">No matches.</p>';
  for (const h of data.hits) box.appendChild(hitRow(h));
});

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
