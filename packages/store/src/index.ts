// @maker/store — local, offline persistence for Maker (the MemoryStore backing).
export { fileMemoryStore, makerHome } from "./file-memory-store.ts";
export type { FileStoreOptions } from "./file-memory-store.ts";
export {
  recordDecision,
  getDecision,
  knownGapIds,
  recordTaste,
  getTaste,
  tasteMemory,
} from "./taste.ts";
export { writeHandoff } from "./handoff-writer.ts";
export type { HandoffBundle } from "./handoff-writer.ts";
export {
  registerTool,
  listTools,
  getTool,
  toolRegistry,
} from "./contract-registry.ts";
