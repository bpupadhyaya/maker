import type * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * A minimal, zero-dependency static file handler serving exactly one tool
 * directory. Sandbox rule: it will never serve a path that resolves outside
 * `dir` (path-traversal → 403). Bound to loopback by the caller.
 */
export function serveDir(
  dir: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const rawUrl = req.url ?? "/";
  const urlPath = decodeURIComponent(rawUrl.split("?")[0] ?? "/");
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");

  const root = path.resolve(dir);
  const target = path.resolve(root, rel);

  // Never escape the tool directory.
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.statusCode = 403;
    res.end("403 Forbidden");
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.setHeader("content-type", CONTENT_TYPES[ext] ?? "application/octet-stream");
    res.end(data);
  });
}
