import * as os from "node:os";

/** Coarse capability tiers (DESIGN.md -> "Hardware tiers are real"). */
export type Tier = "low" | "mid" | "high" | "workstation";

export interface Hardware {
  readonly platform: string; // "darwin" | "win32" | "linux"
  readonly arch: string; // "arm64" | "x64"
  readonly totalMemGB: number;
  readonly cpuCount: number;
  readonly tier: Tier;
}

/** Map installed RAM to a tier — the dominant constraint on local model size. */
export function tierForMemGB(gb: number): Tier {
  if (gb >= 64) return "workstation";
  if (gb >= 28) return "high"; // ~32GB machines
  if (gb >= 14) return "mid"; // ~16GB machines
  return "low";
}

export function detectHardware(): Hardware {
  const totalMemGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalMemGB,
    cpuCount: os.cpus().length,
    tier: tierForMemGB(totalMemGB),
  };
}
