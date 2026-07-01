import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type * as http from "node:http";
import { localWebRuntime, serveDir } from "../src/index.ts";

async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "maker-rt-"));
}

test("builds and serves a tool at a pokeable URL", async () => {
  const rt = localWebRuntime({ rootDir: await tmpRoot() });
  const built = await rt.build({
    id: "hello",
    files: { "index.html": "<!doctype html><h1>Hi Maker</h1>" },
  });
  const running = await rt.run(built);
  try {
    assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(running.url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await res.text(), /Hi Maker/);
  } finally {
    await running.stop();
  }
});

test("serves nested assets with correct content-type", async () => {
  const rt = localWebRuntime({ rootDir: await tmpRoot() });
  const built = await rt.build({
    id: "nested",
    files: {
      "index.html": "<script src=assets/app.js></script>",
      "assets/app.js": "console.log('maker')",
    },
  });
  const running = await rt.run(built);
  try {
    const res = await fetch(running.url + "assets/app.js");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    assert.match(await res.text(), /console\.log\('maker'\)/);
  } finally {
    await running.stop();
  }
});

test("unknown path 404s", async () => {
  const rt = localWebRuntime({ rootDir: await tmpRoot() });
  const running = await rt.run(
    await rt.build({ id: "e404", files: { "index.html": "hi" } }),
  );
  try {
    const res = await fetch(running.url + "does-not-exist.html");
    assert.equal(res.status, 404);
  } finally {
    await running.stop();
  }
});

test("path traversal is blocked at serve time (sandbox)", () => {
  // A standards-compliant client (fetch) normalizes `..` away before sending,
  // so the guard is defense-in-depth: unit-test it with a raw, un-normalized
  // request that a hand-rolled client could still send.
  const req = { url: "/../../package.json" } as unknown as http.IncomingMessage;
  const res = {
    statusCode: 200,
    setHeader() {},
    end() {},
  } as unknown as http.ServerResponse;
  serveDir("/tmp/maker-tool-dir", req, res);
  assert.equal(res.statusCode, 403);
});

test("build rejects files that escape the tool dir (sandbox)", async () => {
  const rt = localWebRuntime({ rootDir: await tmpRoot() });
  await assert.rejects(
    () => rt.build({ id: "evil", files: { "../escape.txt": "no" } }),
    /unsafe path escapes/,
  );
});
