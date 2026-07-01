import { pathToFileURL } from "node:url";
import {
  provisionModel,
  chooseInstaller,
  chooseBackendKind,
  detectHardware,
  selectModel,
} from "../../provision/src/index.ts";

/**
 * Headless `maker setup` — the app-driven provisioning flow as a one-shot CLI,
 * so the installer (or the user) can get a model ready without opening the app.
 * Same logic as the in-app /setup: detect hardware → pick the model → download +
 * verify, with progress. Honors MAKER_BACKEND / MAKER_SIDELOAD.
 */
export async function main(): Promise<void> {
  const hw = detectHardware();
  const preferOllama = process.env["MAKER_BACKEND"] === "ollama";
  const sideloadPath = process.env["MAKER_SIDELOAD"];

  const { installer, kind } = chooseInstaller({
    ...(preferOllama ? { prefer: "ollama" as const } : {}),
    ...(sideloadPath ? { sideloadPath } : {}),
  });
  const runtimeKind = chooseBackendKind(hw, preferOllama ? { prefer: "ollama" } : {});
  const model = selectModel(hw);

  process.stdout.write(
    `Maker setup — installing ${model.name} for your ${hw.tier} machine ` +
      `(via ${kind}, runtime ${runtimeKind})…\n`,
  );

  const result = await provisionModel({
    installer,
    hardware: hw,
    onProgress: (p) => {
      const pct = p.ratio !== undefined ? ` ${Math.round(p.ratio * 100)}%` : "";
      process.stdout.write(`  ${p.message}${pct}\n`);
    },
  });

  process.stdout.write(
    result.ok
      ? "\n✓ Setup complete — Maker is offline-capable. Run `maker` to start.\n"
      : `\n✗ ${result.detail}\n  You can retry later with: maker setup\n`,
  );
  process.exitCode = result.ok ? 0 : 1;
}

const argv1 = process.argv[1];
if (argv1 && import.meta.url === pathToFileURL(argv1).href) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  });
}
