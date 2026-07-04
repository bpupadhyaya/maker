import type { Transcriber } from "../input.ts";
import type { FetchLike } from "./ollama-inference.ts";

/**
 * Offline voice → text via whisper.cpp's server (`/inference`) — the local,
 * offline-first transcriber. The app fetches a whisper.cpp runtime + a ggml
 * voice model (like it does llama.cpp + GGUF) and points this at the running
 * whisper-server. Audio in = 16-bit PCM WAV (the GUI records + encodes it);
 * text out. fetch is injectable so this is testable with no real server/model.
 */
export interface WhisperOptions {
  /** whisper-server base URL, e.g. http://127.0.0.1:8790 */
  readonly host?: string;
  readonly fetch?: FetchLike;
}

const DEFAULT_HOST = "http://127.0.0.1:8790";

export function whisperCppTranscriber(opts: WhisperOptions = {}): Transcriber {
  const host = (opts.host ?? DEFAULT_HOST).replace(/\/+$/, "");
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init as RequestInit) as unknown as ReturnType<FetchLike>);

  return async (audio: Uint8Array): Promise<string> => {
    // whisper.cpp server takes multipart/form-data: file=<wav>, response_format=json.
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
    form.append("response_format", "json");
    form.append("temperature", "0");

    const res = await doFetch(`${host}/inference`, { method: "POST", body: form } as unknown as RequestInit);
    if (!res.ok) throw new Error(`whisper HTTP ${res.status} ${res.statusText ?? ""}`.trim());
    const j = (await (res as unknown as { json(): Promise<unknown> }).json()) as { text?: string };
    return (j.text ?? "").trim();
  };
}
