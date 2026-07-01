/**
 * Multimodal input seam (DESIGN.md -> "Interaction surface: text → voice →
 * sketch"). Every modality normalizes to an InputRequest carrying text, so the
 * rest of the engine stays modality-agnostic. Text works today; voice and sketch
 * take injectable transcriber/describer functions — a real local Whisper (voice)
 * or vision model (sketch) is needs-user, but the pipeline is ready for them.
 */

export type InputModality = "text" | "voice" | "sketch";

export interface InputRequest {
  readonly text: string;
  readonly mode: InputModality;
}

/** Transcribe audio to text (real impl: a local Whisper-class model — needs-user). */
export type Transcriber = (audio: Uint8Array) => Promise<string>;

/** Describe a sketch/image as text (real impl: a local vision model — needs-user). */
export type SketchDescriber = (image: Uint8Array) => Promise<string>;

export function textInput(text: string): InputRequest {
  return { text, mode: "text" };
}

export async function voiceInput(
  audio: Uint8Array,
  transcribe: Transcriber,
): Promise<InputRequest> {
  return { text: await transcribe(audio), mode: "voice" };
}

export async function sketchInput(
  image: Uint8Array,
  describe: SketchDescriber,
): Promise<InputRequest> {
  return { text: await describe(image), mode: "sketch" };
}
