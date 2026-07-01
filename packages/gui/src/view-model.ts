import type { MakerEvent } from "../../engine/src/index.ts";
import type { Brief } from "../../engine/src/index.ts";

/**
 * The GUI's shared, pure view state. The web frontend renders a ViewModel; this
 * reducer folds MakerEvents into it. Keeping it pure means the GUI's core is
 * unit-testable without a browser — the DOM layer on top is thin.
 */

export interface Turn {
  readonly role: "user" | "assistant" | "error";
  readonly text: string;
}

export interface ViewModel {
  readonly transcript: readonly Turn[];
  /** The assistant reply currently streaming in (before assistant-done). */
  readonly streaming: string;
  readonly brief: Brief | undefined;
  /** URL of the running tool for the living-tool webview, if any. */
  readonly toolUrl: string | undefined;
}

export function initialViewModel(): ViewModel {
  return { transcript: [], streaming: "", brief: undefined, toolUrl: undefined };
}

export function addUserTurn(vm: ViewModel, text: string): ViewModel {
  return { ...vm, transcript: [...vm.transcript, { role: "user", text }] };
}

export function reduce(vm: ViewModel, ev: MakerEvent): ViewModel {
  switch (ev.type) {
    case "assistant-delta":
      return { ...vm, streaming: vm.streaming + ev.text };
    case "assistant-done":
      return {
        ...vm,
        streaming: "",
        transcript: [...vm.transcript, { role: "assistant", text: ev.text }],
      };
    case "brief-updated":
      return { ...vm, brief: ev.brief };
    case "tool-running":
      return { ...vm, toolUrl: ev.url };
    case "error":
      return {
        ...vm,
        streaming: "",
        transcript: [...vm.transcript, { role: "error", text: ev.message }],
      };
  }
}
