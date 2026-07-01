/**
 * Mobile thin-client pairing (DESIGN.md -> "mobile thin client paired to the
 * desktop workshop"). The desktop issues a short code; the phone submits it; a
 * match yields a shared session token. The handshake is pure and offline; the
 * real transport (QR / LAN discovery + a physical phone) is needs-user.
 */

export interface PairingResult {
  readonly ok: boolean;
  readonly token?: string;
  readonly reason?: string;
}

export interface PairingSession {
  /** The code shown on the desktop for the phone to enter. */
  readonly code: string;
  /** Submit a candidate code from the client; matches pair the session. */
  submit(candidate: string): PairingResult;
  readonly paired: boolean;
  /** The shared token, available once paired. */
  readonly token: string | undefined;
}

/** A 6-digit pairing code from the Web Crypto RNG (no Math.random). */
export function genPairingCode(): string {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return String((a[0] ?? 0) % 1_000_000).padStart(6, "0");
}

/** A random opaque session token. */
export function genToken(): string {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createPairing(
  code: string = genPairingCode(),
  token: string = genToken(),
): PairingSession {
  let paired = false;
  return {
    code,
    get paired() {
      return paired;
    },
    get token() {
      return paired ? token : undefined;
    },
    submit(candidate: string): PairingResult {
      if (paired) return { ok: true, token };
      if (candidate === code) {
        paired = true;
        return { ok: true, token };
      }
      return { ok: false, reason: "code mismatch" };
    },
  };
}
