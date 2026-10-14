import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Storage is mocked: these cases are about the decode, not the PUTs
vi.mock("@/lib/minio", () => ({
  minioClient: { send: vi.fn(async () => ({})) },
  getMinioBucket: () => "test",
}));

const { uploadPhotoToStorage } = await import("@/lib/media-upload");
const { computeDHash } = await import("@/lib/image-hash");

// A damaged archive file (2026-10-14): "VipsJpeg: premature end of JPEG image".
// Strict decoding refuses it; a lenient upload stores it as far as it decodes and
// reports the strict message, so the image can be flagged for a look.
let truncated: Buffer;
let clean: Buffer;

beforeAll(async () => {
  const w = 600;
  const h = 400;
  const noise = Buffer.alloc(w * h * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 37) % 256;
  clean = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
  truncated = clean.subarray(0, Math.floor(clean.length * 0.6));
});

describe("uploadPhotoToStorage — damaged files", () => {
  it("stays strict by default (re-bake, cover transfer)", async () => {
    await expect(uploadPhotoToStorage(truncated, "image/jpeg", "t", "e", "p")).rejects.toThrow(/premature end/);
  });

  it("stores a truncated JPEG when lenient and reports the strict message", async () => {
    const r = await uploadPhotoToStorage(truncated, "image/jpeg", "t", "e", "p", { lenient: true });
    expect(r.decodeIssue).toMatch(/premature end of JPEG image/);
    expect(r.originalWidth).toBe(600);
    expect(r.variants.master_4000).toBeDefined();
  });

  it("reports no issue for a clean file", async () => {
    const r = await uploadPhotoToStorage(clean, "image/jpeg", "t", "e", "p", { lenient: true });
    expect(r.decodeIssue).toBeNull();
  });

  it("still refuses a file that is not an image at all", async () => {
    await expect(
      uploadPhotoToStorage(Buffer.from("not an image"), "image/jpeg", "t", "e", "p", { lenient: true }),
    ).rejects.toThrow();
  });

  it("fingerprints a damaged file (dHash) instead of throwing", async () => {
    expect(await computeDHash(truncated)).toMatch(/^[0-9a-f]{16}$/);
  });
});
