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
export { cloudInference, optInBackend } from "./backends/cloud-inference.ts";
export type { CloudOptions, OptInController } from "./backends/cloud-inference.ts";
export { synthesizeFiles, MAKER_SYSTEM_PROMPT } from "./synthesizer.ts";
export { createMaker } from "./maker.ts";
export type { Maker, MakerDeps } from "./maker.ts";
export { parseBriefBlock, mergeBrief, renderBrief } from "./brief-manager.ts";
export { classifyKind, detectGaps } from "./gap-detection.ts";
export type { ToolKind, Gap, Clarifier, GapResult, GapOptions } from "./gap-detection.ts";
export {
  evaluateCheck,
  runChecks,
  reportViolations,
  smokeCheck,
  containsCheck,
  parseChecksBlock,
} from "./verification.ts";
export type { Check, Assertion, CheckContext, CheckResult } from "./verification.ts";
export { slugName, renderReadme, buildManifest } from "./handoff.ts";
export type { HandoffManifest, HandoffData } from "./handoff.ts";
export type { TasteMemory } from "./taste-memory.ts";
export { parseContractBlock, deriveContract } from "./contract.ts";
export type { ToolContract, Provision, ToolRegistry } from "./contract.ts";
export { matchTools, snapshotDependency, verifyDependencies } from "./composition.ts";
export type { ReuseMatch, MatchOptions, DependencySnapshot } from "./composition.ts";
export { parsePack, parsePackBlock } from "./pack.ts";
export type { CapabilityPack, PackTemplate, PackRegistry } from "./pack.ts";
export { importTool } from "./tool-export.ts";
export type { ToolExport } from "./tool-export.ts";
export { textInput, voiceInput, sketchInput } from "./input.ts";
export type { InputModality, InputRequest, Transcriber, SketchDescriber } from "./input.ts";
export { emitTarget } from "./target.ts";
export type { BuildTarget, TargetResult, TargetMeta } from "./target.ts";
export { genPairingCode, genToken, createPairing } from "./pairing.ts";
export type { PairingSession, PairingResult } from "./pairing.ts";
export {
  SOFTWARE_DOMAIN,
  ROBOTICS_DOMAIN,
  DOMAINS,
  domainFor,
  classifyDomain,
} from "./domain.ts";
export type { Domain, DomainKind } from "./domain.ts";
export { parseRobotPlan, simulateRobot } from "./robotics.ts";
export type { RobotAction, RobotState, SimResult } from "./robotics.ts";
