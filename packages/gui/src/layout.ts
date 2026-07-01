/**
 * The Talk/Split/Build continuum (DESIGN.md -> "User interface"). One divider
 * between the conversation and the living tool; three snap presets; a
 * conversation-favored default; and a responsive collapse to a single column
 * on narrow widths (the "conversation-only" mode, for free). Pure logic so the
 * layout is testable without a browser.
 */

export type LayoutPreset = "talk" | "split" | "build";

/** Fraction of width given to the conversation for each preset (split is
 *  slightly conversation-favored, per the decided default). */
export const PRESET_FRACTIONS: Readonly<Record<LayoutPreset, number>> = {
  talk: 0.7,
  split: 0.55,
  build: 0.32,
};

/** Below this width the split collapses to a single conversation column. */
export const COLLAPSE_WIDTH = 640;

/** The decided default sits slightly toward Talk. */
export const DEFAULT_PRESET: LayoutPreset = "split";

export interface LayoutState {
  readonly preset: LayoutPreset;
  /** Conversation width fraction (0..1). Ignored while collapsed. */
  readonly conversationFraction: number;
  /** True when the window is too narrow → single-column mode. */
  readonly collapsed: boolean;
}

export function layoutFor(preset: LayoutPreset, width: number): LayoutState {
  return {
    preset,
    conversationFraction: PRESET_FRACTIONS[preset],
    collapsed: width < COLLAPSE_WIDTH,
  };
}

/** Snap a dragged fraction to the nearest preset. */
export function fractionToPreset(fraction: number): LayoutPreset {
  let best: LayoutPreset = "split";
  let bestDist = Infinity;
  for (const p of ["talk", "split", "build"] as const) {
    const d = Math.abs(PRESET_FRACTIONS[p] - fraction);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
