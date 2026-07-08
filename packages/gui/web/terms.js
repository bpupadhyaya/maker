// First-run agreement gate. Maker (free, MIT) and Maker Pro both render this
// core UI, so this single gate covers both packaged products: the workshop is
// unusable until the user accepts the License Agreement & Terms. Acceptance is
// stored locally (no server) keyed to TERMS_VERSION — bump it to re-prompt
// everyone when the agreement materially changes.
(() => {
  const TERMS_VERSION = "2026-07-05";
  const TERMS_URL = "https://equalinformation.com/tools/license.html";
  let accepted = null;
  try {
    accepted = localStorage.getItem("maker-terms-accepted");
  } catch {
    /* storage blocked (private mode) — still gate this session */
  }
  if (accepted === TERMS_VERSION) return;

  function show() {
    const overlay = document.createElement("div");
    overlay.id = "maker-terms";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "License Agreement");
    overlay.innerHTML = `
      <div class="mt-card">
        <div class="mt-head">
          <span class="mt-logo" aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <defs><linearGradient id="mt-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#5b4fe0"/>
              </linearGradient></defs>
              <rect width="100" height="100" rx="24" fill="url(#mt-grad)"/>
              <path d="M25 72V28l25 26 25-26v44" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </span>
          <div class="mt-head-text">
            <span class="mt-kicker">Maker</span>
            <h2>Before you start</h2>
          </div>
        </div>
        <p>Maker is an <b>AI tool</b>. What it generates — code, tools, text — is produced
          automatically and <b>can be inaccurate, insecure, or unsuitable for your purpose</b>. You
          are responsible for reviewing and testing any output before you rely on it, and for how
          you use anything you build. To the fullest extent permitted by law, neither the developers
          nor EqualInformation,&nbsp;LLC is responsible for your use of the tool or its output, or
          for any inappropriate or unlawful use.</p>
        <div class="mt-fine">Your use of Maker and Maker&nbsp;Pro is governed by the
          <a href="${TERMS_URL}" target="_blank" rel="noopener">License Agreement &amp; Terms</a>
          (AI-output disclaimer, acceptable use, limitation of liability). The free Maker source is
          also licensed under the MIT License.</div>
        <label class="mt-check">
          <input type="checkbox" id="mt-agree">
          <span class="mt-box" aria-hidden="true"></span>
          <span class="mt-check-text">I have read and agree to the License Agreement &amp; Terms.</span>
        </label>
        <div class="mt-actions">
          <button id="mt-accept" disabled>Agree &amp; continue</button>
          <a class="mt-readlink" href="${TERMS_URL}" target="_blank" rel="noopener">Read full terms →</a>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cb = overlay.querySelector("#mt-agree");
    const ok = overlay.querySelector("#mt-accept");
    cb.addEventListener("change", () => (ok.disabled = !cb.checked));
    ok.addEventListener("click", () => {
      try {
        localStorage.setItem("maker-terms-accepted", TERMS_VERSION);
      } catch {
        /* ignore */
      }
      overlay.remove();
    });
  }

  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
})();
