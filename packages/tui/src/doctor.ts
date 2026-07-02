import { pathToFileURL } from "node:url";
import * as path from "node:path";
import {
  platformKey,
  buildForPlatform,
  resolveRuntimeUrl,
  detectRuntime,
  runtimeOverride,
  checkProvisioned,
  listInstalledModels,
  getActiveModel,
  modelsDir,
} from "../../provision/src/index.ts";
import type { ProvisionCheck } from "../../provision/src/index.ts";
import * as fs from "node:fs/promises";

/**
 * `maker doctor` — a one-command health check: is this machine ready to run a
 * model offline, and does the llama.cpp runtime actually resolve + reach for THIS
 * OS? Does a real resolution dry-run (hits the releases API + a HEAD probe) but
 * downloads nothing big — so confirming per-OS asset names is one command.
 * Everything is injectable so it smokes offline.
 */
export interface DoctorReport {
  platform: string;
  node: string;
  activeModel: string | null;
  ggufPresent: boolean;
  installedCount: number;
  runtimePath: string | null;
  runtimeSource: "fetched" | "MAKER_RUNTIME" | "ollama" | "none";
  provisioned: ProvisionCheck;
  asset?: string;
  assetUrl?: string;
  reachable?: boolean;
  sizeBytes?: number;
  resolveError?: string;
}

type JsonFetch = (url: string) => Promise<{ ok: boolean; status: number; json?(): Promise<unknown> }>;
type Probe = (url: string) => Promise<{ ok: boolean; status: number; sizeBytes?: number }>;

export interface DoctorOptions {
  readonly fetch?: JsonFetch;
  readonly probe?: Probe;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const usingOllama = process.env["MAKER_BACKEND"] === "ollama";
  const override = runtimeOverride();

  const activeModel = await getActiveModel();
  const ggufPresent = activeModel
    ? await fileExists(path.join(modelsDir(), `${activeModel}.gguf`))
    : false;
  const installed = await listInstalledModels();
  const runtimePath = await detectRuntime();
  const runtimeSource: DoctorReport["runtimeSource"] = override
    ? "MAKER_RUNTIME"
    : usingOllama
      ? "ollama"
      : runtimePath
        ? "fetched"
        : "none";

  const report: DoctorReport = {
    platform: platformKey(),
    node: process.versions.node,
    activeModel,
    ggufPresent,
    installedCount: installed.length,
    runtimePath: runtimePath ?? null,
    runtimeSource,
    provisioned: await checkProvisioned(),
  };

  // Runtime resolution dry-run — resolve the real asset for this OS and probe it,
  // WITHOUT downloading the big binary. Skipped for Ollama / MAKER_RUNTIME.
  const build = buildForPlatform();
  if (build && !override && !usingOllama) {
    const doFetch: JsonFetch = opts.fetch ?? ((u) => fetch(u) as unknown as ReturnType<JsonFetch>);
    const probe: Probe =
      opts.probe ??
      (async (u) => {
        const res = await fetch(u, { method: "HEAD" });
        const len = Number(res.headers.get("content-length") ?? 0);
        return { ok: res.ok, status: res.status, ...(len ? { sizeBytes: len } : {}) };
      });
    try {
      const url = await resolveRuntimeUrl(build, doFetch);
      report.assetUrl = url;
      report.asset = url.split("/").pop() ?? url;
      const p = await probe(url);
      report.reachable = p.ok;
      if (p.sizeBytes) report.sizeBytes = p.sizeBytes;
    } catch (e) {
      report.resolveError = String(e);
    }
  }

  return report;
}

function mb(bytes?: number): string {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : "unknown size";
}

export function formatDoctor(r: DoctorReport): string {
  const lines: string[] = [];
  lines.push("Maker doctor — is this machine ready to run a model offline?\n");
  lines.push(`Platform:     ${r.platform} (node v${r.node})`);
  lines.push(`Active model: ${r.activeModel ?? "(none)"}${r.activeModel ? `  (gguf present: ${r.ggufPresent ? "yes" : "no"})` : ""}`);
  lines.push(`Installed:    ${r.installedCount} model(s)`);
  lines.push(
    `Runtime:      ${
      r.runtimeSource === "fetched"
        ? `fetched → ${r.runtimePath}`
        : r.runtimeSource === "MAKER_RUNTIME"
          ? `MAKER_RUNTIME → ${r.runtimePath}`
          : r.runtimeSource === "ollama"
            ? "Ollama (external)"
            : "not present"
    }`,
  );
  lines.push(`Provisioned:  ${r.provisioned.ready ? "READY — model + runtime present" : `NOT READY — ${r.provisioned.detail}`}`);

  if (r.runtimeSource === "ollama" || r.runtimeSource === "MAKER_RUNTIME") {
    lines.push(`\nRuntime download check: skipped (using ${r.runtimeSource === "ollama" ? "Ollama" : "your MAKER_RUNTIME"}).`);
  } else {
    lines.push("\nRuntime download check (resolves + probes; no big download):");
    if (r.resolveError) {
      lines.push(`  ✗ ${r.resolveError}`);
    } else {
      lines.push(`  Asset:      ${r.asset}`);
      lines.push(`  Reachable:  ${r.reachable ? `yes (${mb(r.sizeBytes)})` : "no — couldn't reach it"}`);
    }
  }

  const ok = r.provisioned.ready || (r.ggufPresent && (r.reachable ?? false));
  lines.push(
    `\nVerdict: ${
      r.provisioned.ready
        ? "✓ Ready to run offline."
        : r.reachable && !r.provisioned.model
          ? "→ Runtime reachable. Run `maker setup` to download a model (+ runtime)."
          : ok
            ? "→ Almost — run `maker setup` to finish."
            : "→ Run `maker setup` (needs internet once), or use Ollama / sideload a .gguf."
    }`,
  );
  return lines.join("\n") + "\n";
}

export async function main(): Promise<void> {
  const report = await runDoctor();
  process.stdout.write(formatDoctor(report));
  process.exitCode = report.provisioned.ready ? 0 : 1;
}

const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
