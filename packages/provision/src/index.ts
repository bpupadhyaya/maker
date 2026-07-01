// @maker/provision — first-run provisioning: detect hardware, pick a model from
// the curated catalog, verify integrity, and run the offline gate. Model
// download + signing + installers are needs-user (network/toolchain/certs).
export type { Tier, Hardware } from "./hardware.ts";
export { tierForMemGB, detectHardware } from "./hardware.ts";
export type { ModelEntry } from "./catalog.ts";
export { MODEL_CATALOG, selectModel } from "./catalog.ts";
export { sha256, verifyChecksum } from "./checksum.ts";
export { compareVersions, upgradeAvailable } from "./versioning.ts";
export type { InstalledModel } from "./versioning.ts";
export type { GateResult } from "./offline-gate.ts";
export { runOfflineGate } from "./offline-gate.ts";
export { provisionModel } from "./provisioner.ts";
export type {
  ModelInstaller,
  ProvisionProgress,
  ProvisionResult,
  ProvisionOptions,
  ProgressFn,
} from "./provisioner.ts";
export { ollamaInstaller } from "./ollama-installer.ts";
export { ggufInstaller } from "./gguf-installer.ts";
export type { GgufOptions } from "./gguf-installer.ts";
