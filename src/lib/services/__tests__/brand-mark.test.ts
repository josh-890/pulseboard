import sharp from "sharp";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { BRAND_COLORS, BRAND_FONTS, resolveBrandMark } from "@/lib/brand-mark";
import { clearBrandLogo, setBrandLogo, setBrandStyle } from "@/lib/services/brand-service";
import { brandOf, getChannelBrands } from "@/lib/services/brand-of";

// Brand marks (2026-11-08): generated wordmark from the name, overrides, and an
// uploaded logo on the DEV database and MinIO. Throwaway channels named BRAND-TEST…

const created: string[] = [];

async function channel(name: string, shortName?: string) {
  const c = await prisma.channel.create({ data: { name, shortName: shortName ?? null } });
  created.push(c.id);
  return c;
}

afterEach(async () => {
  const bucket = getMinioBucket();
  for (const id of created) {
    const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `brand/channel/${id}-` }));
    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await minioClient.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
  }
  await prisma.channel.deleteMany({ where: { id: { in: created } } });
  created.length = 0;
});

describe("the generated mark", () => {
  it("is stable for a name, varies across names, and an override wins", () => {
    const a = resolveBrandMark({ name: "Met Art" });
    expect(resolveBrandMark({ name: "met art " })).toMatchObject({ font: a.font, color: a.color });

    const names = Array.from({ length: 60 }, (_, i) => `Channel ${i}`);
    const fonts = new Set(names.map((n) => resolveBrandMark({ name: n }).font.key));
    const colors = new Set(names.map((n) => resolveBrandMark({ name: n }).color.key));
    expect(fonts.size).toBeGreaterThan(BRAND_FONTS.length / 2);
    expect(colors.size).toBeGreaterThan(BRAND_COLORS.length / 2);

    const other = BRAND_FONTS.find((f) => f.key !== a.font.key)!;
    expect(resolveBrandMark({ name: "Met Art", markFont: other.key }).font.key).toBe(other.key);
    // An unknown key falls back to the generated pick
    expect(resolveBrandMark({ name: "Met Art", markColor: "nope" }).color.key).toBe(a.color.key);
  });

  it("uses the Shortname as monogram when it is short, else the name's initials", () => {
    expect(resolveBrandMark({ name: "Fall In Lust", shortName: "fil" }).monogram).toBe("FIL");
    expect(resolveBrandMark({ name: "Fall In Lust", shortName: "FALLINLUST" }).monogram).toBe("FL");
    expect(resolveBrandMark({ name: "Showy Beauty" }).monogram).toBe("SB");
  });
});

describe("storing a channel's look", () => {
  it("keeps a valid style, refuses an unknown key", async () => {
    const c = await channel("BRAND-TEST Style");
    await setBrandStyle("channel", c.id, { markFont: "script", markColor: "teal" });
    const row = await prisma.channel.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ markFont: "script", markColor: "teal" });
    await expect(setBrandStyle("channel", c.id, { markFont: "comic-sans", markColor: null })).rejects.toThrow(/Unknown font/);
  });

  it("stores a logo as WebP with transparency, refuses a damaged one, and removes it", async () => {
    const c = await channel("BRAND-TEST Logo", "BTL");
    const png = await sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 200, g: 40, b: 90, alpha: 0.5 } } })
      .png()
      .toBuffer();
    const { url } = await setBrandLogo("channel", c.id, png);
    const row = await prisma.channel.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.logoKey).toMatch(new RegExp(`^brand/channel/${c.id}-\\d+\\.webp$`));
    expect(url).toContain(row.logoKey!);
    expect(brandOf(row).logoUrl).toBe(url);
    expect((await getChannelBrands([c.id, null])).get(c.id)?.logoUrl).toBe(url);

    const broken = png.subarray(0, Math.floor(png.length / 2));
    await expect(setBrandLogo("channel", c.id, broken)).rejects.toThrow();
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: c.id } })).logoKey).toBe(row.logoKey);

    await clearBrandLogo("channel", c.id);
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: c.id } })).logoKey).toBeNull();
  });
});
