import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { chromaOfPixels, measureTone, rgbToLab } from "@/lib/image-tone";
import { TONE_BORDER, TONE_THRESHOLD, isBorderline, parseToneBuckets, toneBucketOf, toneCountsLabel, toneOf } from "@/lib/tone";
import { normalizeToneValue } from "@/lib/tag-query";

// Color or black & white (ADR-0041). Images are drawn here: a 64×64 scene with
// a lightness ramp and a few patches, rendered neutral, toned and in color.
type Px = (x: number, y: number) => [number, number, number];

async function image(px: Px, side = 128): Promise<Buffer> {
  const raw = Buffer.alloc(side * side * 3);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const [r, g, b] = px(x / side, y / side);
      const o = (y * side + x) * 3;
      raw[o] = Math.round(r);
      raw[o + 1] = Math.round(g);
      raw[o + 2] = Math.round(b);
    }
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

// A grey scene: a ramp plus a darker figure in the middle
const grey = (x: number, y: number) => {
  const inFigure = (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.06;
  return inFigure ? 60 + 120 * y : 30 + 200 * x;
};
const neutral: Px = (x, y) => {
  const v = grey(x, y);
  return [v, v, v];
};
// Sepia: one warm tint, stronger in the mid-tones — what a toned print looks like
const sepia: Px = (x, y) => {
  const v = grey(x, y);
  const t = Math.sin((v / 255) * Math.PI) * 28;
  return [Math.min(255, v + t), Math.min(255, v + t * 0.45), Math.max(0, v - t * 0.6)];
};
// Color: skin-like figure on a blue background with a red accent
const color: Px = (x, y) => {
  const inFigure = (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.06;
  if (inFigure) return x > 0.55 && y < 0.45 ? [200, 40, 50] : [225, 170, 140];
  return [60 + 60 * y, 110 + 50 * y, 190];
};
// Nearly grey: the color scene pulled 90 % of the way to its grey
const faded: Px = (x, y) => {
  const [r, g, b] = color(x, y);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return [l + (r - l) * 0.12, l + (g - l) * 0.12, l + (b - l) * 0.12];
};

describe("measureTone", () => {
  it("a neutral grey picture is B&W with chroma near zero", async () => {
    const m = await measureTone(await image(neutral));
    expect(m.tone).toBe("MONO");
    expect(m.chroma).toBeLessThan(1.5);
  });

  it("a sepia-toned print is B&W too — the tint is not color", async () => {
    const m = await measureTone(await image(sepia));
    expect(m.tone).toBe("MONO");
  });

  it("a color picture is color, far above the line", async () => {
    const m = await measureTone(await image(color));
    expect(m.tone).toBe("COLOR");
    expect(m.chroma).toBeGreaterThan(TONE_BORDER[1]);
  });

  it("a nearly desaturated color picture lands near the line, between neutral and full color", async () => {
    const [n, f, c] = await Promise.all([image(neutral), image(faded), image(color)].map(async (b) => measureTone(await b)));
    expect(f!.chroma).toBeGreaterThan(n!.chroma);
    expect(f!.chroma).toBeLessThan(c!.chroma);
  });

  it("reads a picture with alpha, and a tiny one", async () => {
    const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 0.5 } } })
      .png()
      .toBuffer();
    const m = await measureTone(png);
    expect(Number.isFinite(m.chroma)).toBe(true);
  });
});

describe("the pieces", () => {
  it("rgbToLab: white, black and grey have no chroma", () => {
    for (const v of [0, 128, 255]) {
      const [, a, b] = rgbToLab(v, v, v);
      expect(Math.abs(a)).toBeLessThan(0.01);
      expect(Math.abs(b)).toBeLessThan(0.01);
    }
  });
  it("chromaOfPixels: an empty buffer is 0", () => {
    expect(chromaOfPixels(Buffer.alloc(0), 3)).toBe(0);
  });
  it("toneOf / isBorderline follow the thresholds", () => {
    expect(toneOf(TONE_THRESHOLD - 0.01)).toBe("MONO");
    expect(toneOf(TONE_THRESHOLD)).toBe("COLOR");
    expect(isBorderline(TONE_BORDER[0])).toBe(true);
    expect(isBorderline(TONE_BORDER[1] + 0.1)).toBe(false);
  });
  it("a set's bucket: one photo of the other kind makes it mixed", () => {
    expect(toneBucketOf({ mono: 0, total: 0 })).toBeNull();
    expect(toneBucketOf({ mono: 0, total: 40 })).toBe("color");
    expect(toneBucketOf({ mono: 40, total: 40 })).toBe("mono");
    expect(toneBucketOf({ mono: 1, total: 40 })).toBe("mixed");
    expect(toneBucketOf({ mono: 39, total: 40 })).toBe("mixed");
    expect(toneCountsLabel({ mono: 12, total: 96 })).toBe("12 of 96 B&W");
  });
  it("URL buckets are whitelisted and de-duplicated", () => {
    expect(parseToneBuckets("mono,mixed,mono,nope")).toEqual(["mono", "mixed"]);
    expect(parseToneBuckets("nope")).toBeUndefined();
    expect(parseToneBuckets(undefined)).toBeUndefined();
  });
  it("tone: values as written", () => {
    expect(normalizeToneValue("B&W")).toBe("bw");
    expect(normalizeToneValue("mono")).toBe("bw");
    expect(normalizeToneValue("Colour")).toBe("color");
    expect(normalizeToneValue("mixed")).toBe("mixed");
    expect(normalizeToneValue("sepia")).toBeNull();
  });
});
