#!/usr/bin/env node
// Build the GUI server (packages/gui/serve.ts) into a SELF-CONTAINED binary so
// the packaged app does NOT require system Node. Uses Bun's `--compile` (one
// step, handles TS + bundling + a bundled runtime). The result is named with the
// Rust target triple that Tauri expects for an `externalBin` sidecar:
//   src-tauri/binaries/maker-server-<target-triple>[.exe]
//
// Run in CI per-OS (Bun installed there). Locally: `node scripts/build-sidecar.mjs`
// after `curl -fsSL https://bun.sh/install | bash`.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "packages/gui/src-tauri/binaries");
mkdirSync(outDir, { recursive: true });

// Rust host target triple (what Tauri appends to externalBin names).
const triple = process.env.TAURI_TARGET_TRIPLE
  || execFileSync("rustc", ["-vV"]).toString().match(/host:\s*(\S+)/)?.[1];
if (!triple) throw new Error("cannot determine target triple — set TAURI_TARGET_TRIPLE");

const ext = triple.includes("windows") ? ".exe" : "";
const outfile = path.join(outDir, `maker-server-${triple}${ext}`);
const entry = path.join(root, "packages/gui/serve.ts");

console.log(`Compiling ${entry}\n     → ${outfile}`);
execFileSync("bun", ["build", entry, "--compile", "--minify", "--outfile", outfile], {
  stdio: "inherit",
  cwd: root,
});
console.log("Sidecar built.");
