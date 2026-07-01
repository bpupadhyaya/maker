/** A labeled assumption Maker made — surfaced for the user to confirm or correct. */
export interface Guess {
  readonly text: string;
  /** What was assumed and why, in plain language. */
  readonly rationale?: string;
}

/**
 * Maker's living, user-visible understanding — the one exposed structure.
 *
 * This is the plain-language *projection*; a richer internal record (holding the
 * verification checks/contracts) will back it in later milestones. See
 * DESIGN.md -> "The Brief".
 */
export interface Brief {
  readonly goal: string;
  readonly decided: readonly string[];
  readonly guesses: readonly Guess[];
  readonly open: readonly string[];
}

/** Persists a tool's Brief across sessions (implemented in M0.6/M0.7). */
export interface BriefStore {
  load(toolId: string): Promise<Brief | undefined>;
  save(toolId: string, brief: Brief): Promise<void>;
}

/** An empty Brief — the starting point before the first turn. */
export function emptyBrief(): Brief {
  return { goal: "", decided: [], guesses: [], open: [] };
}
