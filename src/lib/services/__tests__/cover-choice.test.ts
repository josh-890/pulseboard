import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/media-upload", () => ({ deleteMediaFiles: vi.fn(async () => {}) }));

import { createMediaItemDirect } from "@/lib/services/media-service";
import { applyCoverCheck, coverCheckKind, findCoverCheck } from "@/lib/services/cover-check-service";
import { arrivalTakesCover } from "@/lib/media-role";

// The automatic cover (ADR-0040 addendum): ranked, order-independent, never over a pick.
// Runs against the DEV database; throwaway rows carry RUN and are removed afterwards.
const RUN = `cvc${Date.now().toString(36)}`;
const sets: string[] = [];
let sessionId = "";
// Far-apart hashes: no file here is a copy of another
const HASH = ["0000000000000000", "ffffffffffffffff", "00000000ffffffff", "ffffffff00000000"];

async function newSet(tag: string) {
  const id = (await prisma.set.create({ data: { type: "photo", title: `${RUN} ${tag}` } })).id;
  await prisma.setSession.create({ data: { setId: id, sessionId, isPrimary: false } });
  sets.push(id);
  return id;
}
const arrive = (setId: string, filename: string, i: number) =>
  createMediaItemDirect({
    sessionId,
    setId,
    filename,
    mimeType: "image/jpeg",
    size: 1,
    originalWidth: 1000,
    originalHeight: 1500,
    variants: { master_4000: `${RUN}/${setId}-${i}.webp` },
    phash: HASH[i % HASH.length],
  });
const coverName = async (setId: string) =>
  (await prisma.set.findUniqueOrThrow({ where: { id: setId }, select: { coverMediaItem: { select: { filename: true } } } }))
    .coverMediaItem?.filename;

beforeAll(async () => {
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
});

afterAll(async () => {
  await prisma.set.updateMany({ where: { id: { in: sets } }, data: { coverMediaItemId: null } });
  const media = await prisma.mediaItem.findMany({ where: { sessionId }, select: { id: true } });
  const mids = media.map((m) => m.id);
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: mids } } });
  await prisma.setMediaItem.deleteMany({ where: { setId: { in: sets } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: mids } } });
  await prisma.setSession.deleteMany({ where: { sessionId } });
  await prisma.set.deleteMany({ where: { id: { in: sets } } });
  await prisma.session.deleteMany({ where: { id: sessionId } });
});

describe("arrivalTakesCover", () => {
  const art = (filename: string) => ({ filename, role: "COVER_ART" as const });
  const slot = { coverId: "x", provisional: false, chosen: false, cover: art("T - c1.jpg") };
  it("a better-ranked file takes an automatic cover, a worse one does not", () => {
    expect(arrivalTakesCover(slot, { ...art("T - c.jpg"), provisional: false })).toBe(true);
    expect(arrivalTakesCover(slot, { ...art("T - c2.jpg"), provisional: false })).toBe(false);
    expect(arrivalTakesCover(slot, { filename: "T - 001.jpg", role: "PHOTO", provisional: false })).toBe(false);
  });
  it("never over a cover picked by hand; a stand-in never displaces a cover", () => {
    expect(arrivalTakesCover({ ...slot, chosen: true }, { ...art("T - c.jpg"), provisional: false })).toBe(false);
    expect(arrivalTakesCover(slot, { ...art("cover.jpg"), provisional: true })).toBe(false);
    expect(arrivalTakesCover({ ...slot, coverId: null, cover: null }, { ...art("cover.jpg"), provisional: true })).toBe(true);
  });
});

describe("the automatic cover on arrival", () => {
  it("photo, then -c1, then -c: -c ends up the cover and -c1 is cover art", async () => {
    const s = await newSet("order");
    await arrive(s, "T - 001.jpg", 0);
    await arrive(s, "T - c1.jpg", 1);
    expect(await coverName(s)).toBe("T - c1.jpg");
    await arrive(s, "T - c.jpg", 2);
    expect(await coverName(s)).toBe("T - c.jpg");
    const c1 = await prisma.mediaItem.findFirstOrThrow({ where: { sessionId, filename: "T - c1.jpg" } });
    expect(c1.role).toBe("COVER_ART");
  });

  it("arriving all at once, the best one wins — and nothing deadlocks", async () => {
    const s = await newSet("parallel");
    await Promise.all([arrive(s, "P - c1.jpg", 0), arrive(s, "P - 002.jpg", 1), arrive(s, "P - c.jpg", 2), arrive(s, "P - 003.jpg", 3)]);
    expect(await coverName(s)).toBe("P - c.jpg");
  });

  it("a cover picked by hand stays when cover art arrives", async () => {
    const s = await newSet("chosen");
    const photo = await arrive(s, "C - 001.jpg", 0);
    await prisma.set.update({ where: { id: s }, data: { coverMediaItemId: photo.id, coverIsChosen: true } });
    await arrive(s, "C - c.jpg", 1);
    expect(await coverName(s)).toBe("C - 001.jpg");
  });
});

describe("the cover check", () => {
  it("lists a -c1 cover next to -c, switches the ticked set and keeps the other as picked", async () => {
    const a = await newSet("check-a");
    const b = await newSet("check-b");
    for (const s of [a, b]) {
      await arrive(s, "K - c.jpg", 0);
      const c1 = await arrive(s, "K - c1.jpg", 1);
      // As left by the old first-come rule
      await prisma.set.update({ where: { id: s }, data: { coverMediaItemId: c1.id, coverIsChosen: false } });
    }
    const rows = await findCoverCheck([a, b]);
    expect(rows.map((r) => [r.kind, r.best.filename])).toEqual([
      ["variant", "K - c.jpg"],
      ["variant", "K - c.jpg"],
    ]);
    expect(await applyCoverCheck([a], [b])).toEqual({ switched: 1, kept: 1 });
    expect(await coverName(a)).toBe("K - c.jpg");
    expect(await coverName(b)).toBe("K - c1.jpg");
    expect((await prisma.set.findUniqueOrThrow({ where: { id: b } })).coverIsChosen).toBe(true);
    expect(await findCoverCheck([a, b])).toEqual([]);
  });

  it("tells a photo of the same upload from one of another upload", () => {
    const t = new Date("2026-11-19T10:00:00Z");
    const best = { filename: "T - c.jpg", role: "COVER_ART" as const, createdAt: t };
    const photo = (ms: number) => ({ filename: "T - 001.jpg", role: "PHOTO" as const, createdAt: new Date(t.getTime() + ms) });
    expect(coverCheckKind(photo(30_000), best)).toBe("sameUpload");
    expect(coverCheckKind(photo(-86_400_000), best)).toBe("photo");
    expect(coverCheckKind({ filename: "cover.jpg", role: "COVER_ART", createdAt: t }, best)).toBe("import");
    expect(coverCheckKind(best, best)).toBeNull();
  });
});
