import crypto from "crypto";
import sharp from "sharp";

/** SHA-256 of the raw file buffer */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Perceptual dHash (difference hash) — 64-bit, returned as 16-char hex string.
 * Resize to 9x8 grayscale, compare adjacent pixels → 64-bit fingerprint.
 */
export async function computeDHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let hash = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      if (left > right) {
        hash |= BigInt(1) << BigInt(y * 8 + x);
      }
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Hamming distance between two hex hash strings */
export function hammingDistance(a: string, b: string): number {
  const va = BigInt("0x" + a);
  const vb = BigInt("0x" + b);
  let xor = va ^ vb;
  let dist = 0;
  const ZERO = BigInt(0);
  const ONE = BigInt(1);
  while (xor > ZERO) {
    dist += Number(xor & ONE);
    xor >>= ONE;
  }
  return dist;
}
