import type { Brief } from "./interfaces/brief.ts";
import type { Clarifier } from "./gap-detection.ts";
import type { CheckResult } from "./verification.ts";

/**
 * Events streamed from a Session/Maker as it processes one turn. Front-ends
 * render these; they never call into the model or runtime directly.
 */
export type MakerEvent =
  | { readonly type: "assistant-delta"; readonly text: string }
  | { readonly type: "assistant-done"; readonly text: string }
  | { readonly type: "brief-updated"; readonly brief: Brief }
  | { readonly type: "clarify"; readonly clarifiers: readonly Clarifier[] }
  | { readonly type: "tool-running"; readonly url: string }
  | {
      readonly type: "checks-run";
      readonly results: readonly CheckResult[];
      readonly violations: readonly string[];
    }
  | { readonly type: "error"; readonly message: string };
