/**
 * The taste seam the engine depends on. Implemented by @maker/store (backed by
 * the local MemoryStore), injected into createMaker. Keeps the engine decoupled
 * from the store's key format while letting decisions shrink gap-detection.
 */
export interface TasteMemory {
  /** Gap ids already decided — passed to detectGaps({ known }). */
  knownGapIds(): Promise<readonly string[]>;
  /** Record a ratified decision (gap id -> chosen value). */
  recordDecision(gapId: string, value: string): Promise<void>;
}
