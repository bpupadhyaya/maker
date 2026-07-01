import type { MakerEvent } from "../../engine/src/index.ts";

/**
 * Pure formatting of a MakerEvent into terminal text. Kept separate from I/O so
 * it is trivially unit-testable. The TUI is a thin client: it renders events,
 * it never reaches into the model or runtime.
 */
export function renderEvent(ev: MakerEvent): string {
  switch (ev.type) {
    case "assistant-delta":
      return ev.text;
    case "assistant-done":
      // Text already streamed via deltas; nothing more to print.
      return "";
    case "error":
      return `\n⚠  ${ev.message}`;
    case "tool-running":
      return `\n▶  running at ${ev.url}`;
    case "brief-updated":
      // The Brief gets its own surface in later milestones (M0.6+).
      return "";
  }
}
