import type { MakerEvent } from "../../engine/src/index.ts";
import { renderBrief } from "../../engine/src/index.ts";

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
    case "clarify":
      return (
        "\n" +
        ev.clarifiers.map((c) => `  ? ${c.prompt}`).join("\n") +
        "\n"
      );
    case "checks-run":
      return ev.violations.length === 0
        ? `\n✓  ${ev.results.length} checks passed`
        : "\n" + ev.violations.map((v) => `  ${v}`).join("\n") + "\n";
    case "brief-updated":
      return `\n─ Brief ───────────────────\n${renderBrief(ev.brief)}\n───────────────────────────\n`;
  }
}
