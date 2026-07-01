import type { ToolRuntime } from "../../engine/src/index.ts";

export interface GateResult {
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * The offline gate (DESIGN.md -> the "trust moment"): with no network, build and
 * run a trivial tool end to end and confirm it serves. Passing is the explicit
 * promise — "you are now 100% offline-capable." This is "always-runnable" applied
 * to the install itself, and it runs as a CI release gate per OS.
 */
export async function runOfflineGate(runtime: ToolRuntime): Promise<GateResult> {
  const marker = "maker-offline-ok";
  try {
    const built = await runtime.build({
      id: "__offline_gate__",
      files: {
        "index.html": `<!doctype html><span id="m">${marker}</span>`,
      },
    });
    const running = await runtime.run(built);
    try {
      const res = await fetch(running.url);
      const text = await res.text();
      const passed = res.status === 200 && text.includes(marker);
      return {
        passed,
        detail: passed
          ? "built and served a tool with no network"
          : `unexpected response (status ${res.status})`,
      };
    } finally {
      await running.stop();
    }
  } catch (err) {
    return {
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
