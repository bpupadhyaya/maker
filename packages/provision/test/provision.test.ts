import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  tierForMemGB,
  detectHardware,
  selectModel,
  MODEL_CATALOG,
  verifyChecksum,
  sha256,
  runOfflineGate,
} from "../src/index.ts";
import type { Hardware } from "../src/index.ts";
import { localWebRuntime } from "../../runtime/src/index.ts";

function hw(totalMemGB: number): Hardware {
  return { platform: "linux", arch: "x64", totalMemGB, cpuCount: 8, tier: tierForMemGB(totalMemGB) };
}

test("tierForMemGB maps RAM to tiers", () => {
  assert.equal(tierForMemGB(8), "low");
  assert.equal(tierForMemGB(16), "mid");
  assert.equal(tierForMemGB(32), "high");
  assert.equal(tierForMemGB(64), "workstation");
});

test("detectHardware returns a sane profile", () => {
  const h = detectHardware();
  assert.ok(h.totalMemGB > 0);
  assert.ok(h.cpuCount >= 1);
  assert.ok(["darwin", "win32", "linux"].includes(h.platform) || typeof h.platform === "string");
});

test("selectModel picks the strongest model that fits RAM", () => {
  assert.equal(selectModel(hw(16)).id, "qwen2.5-coder-7b");
  assert.equal(selectModel(hw(32)).id, "qwen2.5-coder-14b");
  assert.equal(selectModel(hw(96)).id, "qwen2.5-coder-32b");
});

test("selectModel falls back to the smallest on very low RAM", () => {
  const m = selectModel(hw(6));
  const smallestFloor = Math.min(...MODEL_CATALOG.map((x) => x.minMemGB));
  assert.equal(m.minMemGB, smallestFloor);
});

test("the recommended default per tier is permissively licensed", () => {
  // The auto-picked defaults are safe (Apache-2.0/MIT); the wider catalog also
  // offers models under their own terms (Llama/Gemma/Codestral), noted honestly.
  for (const m of MODEL_CATALOG.filter((x) => x.recommended)) {
    assert.match(m.license, /MIT|Apache-2\.0/);
  }
});

test("verifyChecksum accepts a matching sha256 and rejects a wrong one", () => {
  const data = "hello maker";
  assert.equal(verifyChecksum(data, sha256(data)), true);
  assert.equal(verifyChecksum(data, "0".repeat(64)), false);
});

test("the offline gate builds+serves offline and reports provisioning (H7.4)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maker-gate-"));
  const prevHome = process.env["MAKER_HOME"];
  const prevBackend = process.env["MAKER_BACKEND"];
  process.env["MAKER_HOME"] = root; // isolated, empty → not provisioned
  try {
    delete process.env["MAKER_BACKEND"];
    const notReady = await runOfflineGate(localWebRuntime({ rootDir: root }));
    assert.equal(notReady.provisioned?.ready, false); // no model/runtime yet
    assert.match(notReady.detail, /builds offline/); // the build+serve half works

    // With a runtime available (Ollama here), the gate certifies offline-ready.
    process.env["MAKER_BACKEND"] = "ollama";
    const ready = await runOfflineGate(localWebRuntime({ rootDir: root }));
    assert.equal(ready.passed, true, ready.detail);
  } finally {
    if (prevHome === undefined) delete process.env["MAKER_HOME"];
    else process.env["MAKER_HOME"] = prevHome;
    if (prevBackend === undefined) delete process.env["MAKER_BACKEND"];
    else process.env["MAKER_BACKEND"] = prevBackend;
  }
});

test("the offline gate fails cleanly when the runtime is broken", async () => {
  const broken = {
    async build() {
      throw new Error("no runtime");
    },
    async run() {
      throw new Error("unreachable");
    },
  };
  const result = await runOfflineGate(broken);
  assert.equal(result.passed, false);
  assert.match(result.detail, /no runtime/);
});
