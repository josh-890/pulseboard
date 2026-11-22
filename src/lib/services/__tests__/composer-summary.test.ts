import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getComposerCoverageForSets, getComposerSummary } from "@/lib/services/composer-summary-service";

// The set as its photos are tagged (ADR-0042, S5), against the DEV database and
// its seeded Composer catalogue (standing ∈ Figure, high-heels ∈ Clothing).

const RUN = `cps${Date.now().toString(36)}`;
let sessionId = "";
let setId = "";
let emptySet = "";
const media: string[] = [];

beforeAll(async () => {
  const tag = async (slug: string) => (await prisma.tagDefinition.findFirstOrThrow({ where: { slug }, select: { id: true } })).id;
  const [standing, heels] = [await tag("standing"), await tag("high-heels")];
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  setId = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set` } })).id;
  emptySet = (await prisma.set.create({ data: { type: "photo", title: `${RUN} empty` } })).id;
  const photo = async (role: "PHOTO" | "COVER_ART", tags: string[]) => {
    const m = await prisma.mediaItem.create({
      data: { sessionId, mediaType: "PHOTO", role, filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, fileRef: "x" },
    });
    media.push(m.id);
    await prisma.setMediaItem.create({ data: { setId, mediaItemId: m.id, sortOrder: media.length } });
    if (tags.length) await prisma.mediaItemTag.createMany({ data: tags.map((t) => ({ mediaItemId: m.id, tagDefinitionId: t })) });
  };
  await photo("PHOTO", [standing, heels]);
  await photo("PHOTO", [standing]);
  await photo("PHOTO", []);
  await photo("COVER_ART", [heels]); // never counts
});

afterAll(async () => {
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  await prisma.set.deleteMany({ where: { id: { in: [setId, emptySet] } } });
  await prisma.session.delete({ where: { id: sessionId } });
});

describe("composer summary", () => {
  it("counts photos tagged per path and the tags they carry", async () => {
    const s = await getComposerSummary(setId);
    expect(s).toMatchObject({ total: 3, tagged: 2 });
    const figure = s.paths.find((p) => p.name === "Figure")!;
    const clothing = s.paths.find((p) => p.name === "Clothing")!;
    expect(figure.tagged).toBe(2);
    expect(figure.tags).toEqual([expect.objectContaining({ name: "standing", count: 2 })]);
    expect(clothing.tagged).toBe(1);
    expect(clothing.tags).toEqual([expect.objectContaining({ name: "high-heels", count: 1 })]);
    expect(s.paths.find((p) => p.name === "Camera")!.tagged).toBe(0);
  });

  it("coverage for the cards: tagged of all photos; sets without photos left out", async () => {
    const c = await getComposerCoverageForSets([setId, emptySet]);
    expect(c.get(setId)).toEqual({ tagged: 2, total: 3 });
    expect(c.has(emptySet)).toBe(false);
  });
});
