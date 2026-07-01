// @maker/engine — public surface. Front-ends and adapters import only from here.

export type { Role, ChatMessage } from "./types.ts";
export type { InferenceBackend, GenerateRequest } from "./interfaces/inference.ts";
export type {
  ToolRuntime,
  ToolSpec,
  BuiltTool,
  RunningTool,
} from "./interfaces/tool-runtime.ts";
export type { MemoryStore } from "./interfaces/memory.ts";
export type { Brief, Guess, BriefStore } from "./interfaces/brief.ts";
export { emptyBrief } from "./interfaces/brief.ts";
export type { MakerEvent } from "./events.ts";
export type { Session, SessionDeps } from "./session.ts";
export { createSession } from "./session.ts";
export { echoInference } from "./backends/echo-inference.ts";
export type { EchoOptions } from "./backends/echo-inference.ts";
export { ollamaInference } from "./backends/ollama-inference.ts";
export type { OllamaOptions, FetchLike } from "./backends/ollama-inference.ts";
