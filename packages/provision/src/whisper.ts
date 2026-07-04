import * as fs from "node:fs/promises";
import * as path from "node:path";
import { modelsDir } from "./models-store.ts";

/**
 * Offline voice models (whisper.cpp ggml). The app downloads one of these (like a
 * GGUF LLM) to enable fully-offline voice → text. Small: tiny.en ~75MB,
 * base.en ~150MB. TOFU checksums (left undefined = trust-on-first-use).
 */
export interface WhisperModel {
  readonly id: string;
  readonly name: string;
  readonly approxSizeMB: number;
  readonly url: string;
  readonly recommended?: boolean;
}

const HF = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export const WHISPER_CATALOG: readonly WhisperModel[] = [
  { id: "tiny.en", name: "Whisper Tiny (English)", approxSizeMB: 75, url: `${HF}/ggml-tiny.en.bin` },
  { id: "base.en", name: "Whisper Base (English)", approxSizeMB: 148, url: `${HF}/ggml-base.en.bin`, recommended: true },
  { id: "small.en", name: "Whisper Small (English)", approxSizeMB: 466, url: `${HF}/ggml-small.en.bin` },
];

/** Path where a whisper model lives (alongside the LLMs, in the Maker home). */
export function whisperModelPath(id: string): string {
  return path.join(modelsDir(), `whisper-${id}.bin`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** The first installed whisper model id, if any. */
export async function installedWhisperModel(): Promise<string | undefined> {
  for (const m of WHISPER_CATALOG) {
    if (await exists(whisperModelPath(m.id))) return m.id;
  }
  return undefined;
}

export async function hasWhisperModel(): Promise<boolean> {
  return (await installedWhisperModel()) !== undefined;
}
