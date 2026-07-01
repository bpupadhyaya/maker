import { createHash } from "node:crypto";

/** Hex SHA-256 of bytes or text — for verifying a fetched or sideloaded model. */
export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Constant-purpose checksum check for the fetch/sideload integrity guard. */
export function verifyChecksum(
  data: Uint8Array | string,
  expected: string,
): boolean {
  return sha256(data).toLowerCase() === expected.trim().toLowerCase();
}
