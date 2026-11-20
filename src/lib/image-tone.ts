import sharp from "sharp";
import { toneOf, type ToneValue } from "./tone";

export { toneOf, type ToneValue };

/**
 * Color or black & white (ADR-0041). One number per image, `chroma`: how much
 * color is left once the image's tint is taken away.
 *
 * - The image is shrunk to 64 px and each pixel converted to CIE Lab.
 * - The tint is removed per lightness band: the mean a/b of the pixels of
 *   similar lightness. A sepia, selenium or split-toned print has one tint per
 *   lightness, so it comes out like neutral grey; a color photo has different
 *   colors at the same lightness (skin, hair, a dress, the sky) and keeps them.
 * - `chroma` is the 95th percentile of what is left — a few colored pixels
 *   (a red lip) count, JPEG noise does not.
 *
 * Calibrated on 1500 xpulse photos (2026-11-20): neutral B&W ≈ 0.1, sepia
 * prints 3.8–4.3, the palest skin-only color photos 5.6 and up. Below
 * `TONE_THRESHOLD` an image is MONO. Images in `TONE_BORDER` are the ones
 * worth a look (Settings → System → Tone check).
 */
const SIDE = 64;
const BANDS = 10;

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116);

/** sRGB 0–255 → CIE Lab (D65) */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Chroma left after the per-lightness tint is removed, from raw RGB pixels (3 channels) */
export function chromaOfPixels(pixels: Uint8Array | Buffer, channels: number): number {
  const n = Math.floor(pixels.length / channels);
  if (n === 0) return 0;
  const L = new Float64Array(n);
  const A = new Float64Array(n);
  const Bv = new Float64Array(n);
  const band = new Uint8Array(n);
  const sumA = new Float64Array(BANDS);
  const sumB = new Float64Array(BANDS);
  const cnt = new Float64Array(BANDS);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const [l, a, b] = channels >= 3 ? rgbToLab(pixels[o], pixels[o + 1], pixels[o + 2]) : [0, 0, 0];
    L[i] = l;
    A[i] = a;
    Bv[i] = b;
    const k = Math.min(BANDS - 1, Math.max(0, Math.floor((l / 100) * BANDS)));
    band[i] = k;
    sumA[k] += a;
    sumB[k] += b;
    cnt[k] += 1;
  }
  const residual = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = band[i];
    const da = A[i] - sumA[k] / cnt[k];
    const db = Bv[i] - sumB[k] / cnt[k];
    residual[i] = Math.sqrt(da * da + db * db);
  }
  residual.sort();
  return residual[Math.min(n - 1, Math.floor(n * 0.95))];
}

/** Measure an image: its chroma and whether that makes it color or B&W */
export async function measureTone(buffer: Buffer): Promise<{ tone: ToneValue; chroma: number }> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize(SIDE, SIDE, { fit: "inside" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const chroma = Math.round(chromaOfPixels(data, info.channels) * 100) / 100;
  return { tone: toneOf(chroma), chroma };
}
