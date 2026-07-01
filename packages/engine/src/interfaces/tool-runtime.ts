/**
 * A description of a tool to build. Shape firmed up in M0.4/M0.5; declared now
 * so the engine can depend on the interface from the start.
 */
export interface ToolSpec {
  readonly id: string;
  /** path -> source text. The always-runnable web/TS artifact. */
  readonly files: Readonly<Record<string, string>>;
  /** Entry file (defaults decided by the runtime if omitted). */
  readonly entry?: string;
}

/** A built, not-yet-running tool on disk. */
export interface BuiltTool {
  readonly id: string;
  readonly dir: string;
}

/** A running, pokeable tool. */
export interface RunningTool {
  readonly id: string;
  /** Local URL the user can poke (the "living tool"). */
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Builds and runs a generated web/TS tool locally and sandboxed, fully offline.
 * Implemented in M0.4. The "always-runnable" invariant lives behind this seam.
 */
export interface ToolRuntime {
  build(spec: ToolSpec): Promise<BuiltTool>;
  run(tool: BuiltTool): Promise<RunningTool>;
}
