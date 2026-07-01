import type { Brief } from "./interfaces/brief.ts";

/**
 * Events streamed from a Session as it processes one turn. Front-ends render
 * these; they never call into the model or runtime directly. The discriminated
 * union grows as milestones add capabilities (Brief, tools, ...).
 */
export type MakerEvent =
  | { readonly type: "assistant-delta"; readonly text: string }
  | { readonly type: "assistant-done"; readonly text: string }
  | { readonly type: "brief-updated"; readonly brief: Brief }
  | { readonly type: "tool-running"; readonly url: string }
  | { readonly type: "error"; readonly message: string };
