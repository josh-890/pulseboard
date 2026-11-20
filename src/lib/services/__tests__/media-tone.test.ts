import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/media-upload", () => ({ deleteMediaFiles: vi.fn(async () => {}) }));

import { createMediaItemDirect, copyMediaToReferenceSession } from "@/lib/services/media-service";
import {
  applyToneCheck,
  findToneCheck,
  getToneCountsForSets,
  setIdsByTone,
  setMediaTone,
} from "@/lib/services/tone-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import { buildSetWhere, getSetFacetCounts } from "@/lib/services/set-service";
import type { TaggableEntity } from "@/lib/tag-domains";

// Color / B&W (ADR-0041) against the DEV database; throwaway rows carry RUN.
const RUN = `tone${Date.now().toString(36)}`;
const sets: Record<"color" | "mono" | "mixed" | "art" | "unmeasured", string> = {
  color: "",
  mono: "",
  mixed: "",
  art: "",
  unmeasured: "",
};
let sessionId = "";
let n = 0;

async function newSet(tag: string) {
  const id = (await prisma.set.create({ data: { type: "photo", title: `${RUN} ${tag}` } })).id;
  await prisma.setSession.create({ data: { setId: id, sessionId, isPrimary: false } });
  return id;
}
async function photo(setId: string, tone: "COLOR" | "MONO" | null, chroma: number | null, filename = `p${n}.jpg`) {
  n += 1;
  return (
    await createMediaItemDirect({
      sessionId,
      setId,
      filename,
      mimeType: "image/jpeg",
      size: 1,
      originalWidth: 1000,
      originalHeight: 1500,
      variants: { master_4000: `${RUN}/${n}.webp` },
      phash: n.toString(16).padStart(16, "0"),
      tone,
      chroma,
    })
  ).id;
}
const match = async (entity: TaggableEntity, q: string, within: string[]) => {
  const f = await resolveTagFilterParam(q, entity);
  return (await findTagMatchIds(entity, f!.resolved, within)).sort();
};

beforeAll(async () => {
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  sets.color = await newSet("color");
  await photo(sets.color, "COLOR", 22);
  await photo(sets.color, "COLOR", 18);
  sets.mono = await newSet("mono");
  await photo(sets.mono, "MONO", 0.1);
  await photo(sets.mono, "MONO", 4.1);
  sets.mixed = await newSet("mixed");
  await photo(sets.mixed, "COLOR", 30);
  await photo(sets.mixed, "COLOR", 25);
  await photo(sets.mixed, "MONO", 0.2);
  // B&W photos with a color cover art: the art never counts
  sets.art = await newSet("art");
  await photo(sets.art, "MONO", 0.3);
  await photo(sets.art, "COLOR", 40, "Title - c.jpg");
  sets.unmeasured = await newSet("unmeasured");
  await photo(sets.unmeasured, null, null);
});

afterAll(async () => {
  const ids = Object.values(sets);
  await prisma.set.updateMany({ where: { id: { in: ids } }, data: { coverMediaItemId: null } });
  const media = await prisma.mediaItem.findMany({
    where: { OR: [{ sessionId }, { filename: { startsWith: RUN } }, { variants: { path: ["master_4000"], string_starts_with: RUN } }] },
    select: { id: true },
  });
  const mids = media.map((m) => m.id);
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: mids } } });
  await prisma.setMediaItem.deleteMany({ where: { setId: { in: ids } } });
  await prisma.mediaItem.updateMany({ where: { copiedFromMediaItemId: { in: mids } }, data: { copiedFromMediaItemId: null } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: mids } } });
  await prisma.setSession.deleteMany({ where: { sessionId } });
  await prisma.set.deleteMany({ where: { id: { in: ids } } });
  await prisma.session.deleteMany({ where: { id: sessionId } });
});

describe("a set's tone", () => {
  it("buckets: color only, B&W only, mixed — cover art and unmeasured photos never count", async () => {
    const all = Object.values(sets);
    const pick = async (b: "color" | "mono" | "mixed") => (await setIdsByTone([b])).filter((id) => all.includes(id)).sort();
    expect(await pick("color")).toEqual([sets.color]);
    expect(await pick("mono")).toEqual([sets.mono, sets.art].sort());
    expect(await pick("mixed")).toEqual([sets.mixed]);
  });

  it("the card counts", async () => {
    const m = await getToneCountsForSets([sets.mixed, sets.art, sets.unmeasured]);
    expect(m.get(sets.mixed)).toEqual({ mono: 1, total: 3 });
    expect(m.get(sets.art)).toEqual({ mono: 1, total: 1 });
    expect(m.has(sets.unmeasured)).toBe(false);
  });

  it("the /sets filter and its facet counts", async () => {
    const where = await buildSetWhere({ tones: ["mono", "mixed"], ids: Object.values(sets) });
    const found = (await prisma.set.findMany({ where, select: { id: true } })).map((s) => s.id).sort();
    expect(found).toEqual([sets.mono, sets.mixed, sets.art].sort());
    const counts = await getSetFacetCounts({ tones: ["mono"], ids: Object.values(sets), type: "all" });
    expect(counts.tone).toEqual({ color: 1, mono: 2, mixed: 1 });
  });
});

describe("tone: in the query language", () => {
  it("sets: tone:bw / tone:color / tone:mixed match the buckets", async () => {
    const all = Object.values(sets);
    expect(await match("SET", "tone:bw", all)).toEqual([sets.mono, sets.art].sort());
    expect(await match("SET", "tone:color", all)).toEqual([sets.color]);
    expect(await match("SET", "tone:mixed", all)).toEqual([sets.mixed]);
  });

  it("a session over its photos", async () => {
    expect(await match("SESSION", "tone:mixed", [sessionId])).toEqual([sessionId]);
    expect(await match("SESSION", "tone:bw", [sessionId])).toEqual([]);
  });

  it("images: tone:b&w and tone:color; tone:mixed is a problem, not a silent miss", async () => {
    const photos = await prisma.mediaItem.findMany({ where: { sessionId }, select: { id: true, tone: true, role: true } });
    const ids = photos.map((p) => p.id);
    const mono = photos.filter((p) => p.tone === "MONO" && p.role === "PHOTO").map((p) => p.id).sort();
    expect(await match("MEDIA_ITEM", "tone:b&w", ids)).toEqual(mono);
    const f = await resolveTagFilterParam("tone:mixed", "MEDIA_ITEM");
    expect(f?.problems.join(" ")).toMatch(/sets and sessions/);
  });
});

describe("by hand", () => {
  it("a hand decision wins and survives; null hands it back to the measurement", async () => {
    const id = await photo(sets.color, "COLOR", 6.2);
    await setMediaTone([id], "MONO");
    let it = await prisma.mediaItem.findUniqueOrThrow({ where: { id } });
    expect([it.tone, it.toneIsManual]).toEqual(["MONO", true]);
    await setMediaTone([id], null);
    it = await prisma.mediaItem.findUniqueOrThrow({ where: { id } });
    expect([it.tone, it.toneIsManual]).toEqual(["COLOR", false]);
  });

  it("a copy keeps the tone and whether it was set by hand", async () => {
    const id = await photo(sets.mono, "MONO", 0.5);
    await setMediaTone([id], "COLOR");
    const ref = await prisma.session.create({ data: { name: `${RUN} ref`, type: "REFERENCE" } });
    try {
      vi.doMock("@/lib/media-upload", () => ({
        copyMediaFilesToReference: async () => ({ variants: { master_4000: `${RUN}/copy.webp` }, fileRef: null }),
      }));
      const copyId = await copyMediaToReferenceSession(id, ref.id);
      const copy = await prisma.mediaItem.findUniqueOrThrow({ where: { id: copyId } });
      expect([copy.tone, copy.chroma, copy.toneIsManual]).toEqual(["COLOR", 0.5, true]);
      await prisma.mediaItem.delete({ where: { id: copyId } });
    } finally {
      vi.doUnmock("@/lib/media-upload");
      await prisma.session.delete({ where: { id: ref.id } });
    }
  });
});

describe("the tone check", () => {
  it("lists borderline photos not decided by hand, nearest the line first; Apply decides them", async () => {
    const near = await photo(sets.color, "COLOR", 5.05);
    const far = await photo(sets.color, "MONO", 3.2);
    const { items } = await findToneCheck(5000);
    const mine = items.filter((i) => i.id === near || i.id === far).map((i) => i.id);
    expect(mine).toEqual([near, far]);
    await applyToneCheck([
      { id: near, tone: "MONO" },
      { id: far, tone: "MONO" },
    ]);
    const after = await findToneCheck(5000);
    expect(after.items.some((i) => i.id === near || i.id === far)).toBe(false);
    const got = await prisma.mediaItem.findMany({ where: { id: { in: [near, far] } }, select: { tone: true, toneIsManual: true } });
    expect(got.every((g) => g.tone === "MONO" && g.toneIsManual)).toBe(true);
  });
});
