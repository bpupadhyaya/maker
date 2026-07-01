// @maker/runtime — builds and runs generated web/TS tools locally, offline,
// sandboxed. Implements the engine's ToolRuntime interface.
export { localWebRuntime } from "./local-web-runtime.ts";
export type { LocalWebRuntimeOptions } from "./local-web-runtime.ts";
export { serveDir } from "./static-server.ts";
