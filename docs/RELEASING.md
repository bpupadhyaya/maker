# Releasing Maker (native installers via GitHub Releases)

Distribution channel (decided, `DESIGN.md`): **this repo's GitHub Releases** are primary;
package managers (brew/winget/AppImage) point back at those assets later.

The whole build runs in **GitHub Actions** (`.github/workflows/release.yml`) — you do not need
Windows/Linux machines. One codebase → `.dmg` (macOS), `.msi`/`.exe` (Windows),
`.AppImage`/`.deb` (Linux).

## How it works
1. `scripts/build-sidecar.mjs` compiles `packages/gui/serve.ts` → a **self-contained server
   binary** (Bun `--compile`) named `maker-server-<target-triple>` under
   `packages/gui/src-tauri/binaries/`. The packaged app needs **no system Node**.
2. Tauri bundles that sidecar (`externalBin`) + the web UI (`resources: ../web → web`) and, at
   runtime, `main.rs` spawns the sidecar with `MAKER_WEB_DIR` pointing at the bundled assets, then
   opens a native window at `http://127.0.0.1:4319`. The native app == the browser GUI.
3. `tauri-action` builds the OS-native installers and uploads them to a **draft** GitHub Release.

The installer stays small (~50–90 MB) — the **model + llama.cpp runtime download on first run**
(unchanged provisioning), never bundled.

## Phase A — ship UNSIGNED (now, $0, no accounts)
```sh
git tag v0.1.0 && git push origin v0.1.0
```
Actions builds all three installers → **draft release** on GitHub → review → Publish. Users get a
one-time "unidentified developer" prompt (macOS: right-click → Open; Windows: More info → Run).
Expect 1–2 CI iterations the first time (packaging always needs real-run fixes).

## Phase B — SIGNED (when you buy certs)
Add repo **Secrets** (Settings → Secrets → Actions); the workflow already reads them:
- macOS ($99/yr Apple Developer): `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`.
- Windows (~$100–400/yr Authenticode, or Azure Trusted Signing): `WINDOWS_CERTIFICATE`,
  `WINDOWS_CERTIFICATE_PASSWORD`.
Re-tag → signed, notarized builds, no OS warnings. **Signing is the only paid part.**

## Phase C — auto-update (optional)
Generate a Tauri updater keypair (`npx @tauri-apps/cli signer generate`), add
`TAURI_SIGNING_PRIVATE_KEY` (+ password) as secrets, add the `updater` plugin + `latest.json`
endpoint. Never forced (offline-first).

## Stable "always latest" download URLs
```
github.com/bpupadhyaya/maker/releases/latest/download/Maker_x64.dmg
github.com/bpupadhyaya/maker/releases/latest/download/Maker_x64-setup.exe
github.com/bpupadhyaya/maker/releases/latest/download/maker_amd64.AppImage
```
(Exact asset names come from the first build — update the README links to match.)

## Replace the placeholder icon
`packages/gui/src-tauri/icon-source.png` is a generated placeholder. Drop a real 1024×1024 PNG in
its place; CI regenerates all platform icons via `tauri icon`.
