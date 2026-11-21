import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addTagExample, getTagCard, getTitleExamples, removeTagExample, setTitleExample } from "@/lib/services/tag-example-service";
import { mergeTagDefinitions } from "@/lib/services/tag-service";

// Tag examples (ADR-0042, S4) against the DEV database; throwaway rows carry RUN.

const RUN = `tex${Date.now().toString(36)}`;
let groupId = "";
let sessionId = "";
const t: Record<string, string> = {};
const p: string[] = [];
const box = { x: 0.3, y: 0.2, w: 0.4, h: 0.6 };

beforeAll(async () => {
  groupId = (await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT" } })).id;
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  for (const k of ["kneeling", "seiza", "merged"])
    t[k] = (await prisma.tagDefinition.create({ data: { groupId, name: `${RUN}-${k}`, slug: `${RUN}-${k}`, nameNorm: `${RUN}-${k}`, description: `${k} def` } })).id;
  await prisma.tagConfusable.create({ data: t.kneeling < t.seiza ? { tagAId: t.kneeling, tagBId: t.seiza } : { tagAId: t.seiza, tagBId: t.kneeling } });
  for (let i = 0; i < 7; i++) {
    const m = await prisma.mediaItem.create({
      data: {
        sessionId,
        mediaType: "PHOTO",
        filename: `${RUN}-${i}.jpg`,
        mimeType: "image/jpeg",
        size: 1,
        originalWidth: 600,
        originalHeight: 900,
        variants: { gallery_512: `${RUN}/${i}-512.webp`, view_1200: `${RUN}/${i}-1200.webp`, master_4000: `${RUN}/${i}.webp` },
      },
    });
    p.push(m.id);
  }
  await prisma.mediaItemTag.createMany({ data: [p[5], p[6]].map((mediaItemId) => ({ mediaItemId, tagDefinitionId: t.kneeling })) });
});

afterAll(async () => {
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: p } } });
  await prisma.mediaItem.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { groupId } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId } });
  await prisma.tagGroup.delete({ where: { id: groupId } });
});

describe("tag examples", () => {
  it("the first example is the title; up to five; re-adding re-crops", async () => {
    for (let i = 0; i < 5; i++) await addTagExample(t.kneeling, p[i], box);
    await expect(addTagExample(t.kneeling, p[6], box)).rejects.toThrow(/at most 5/);
    await addTagExample(t.kneeling, p[0], { x: 0.1, y: 0.1, w: 0.2, h: 0.3 });
    const rows = await prisma.tagExample.findMany({ where: { tagId: t.kneeling }, orderBy: { sortOrder: "asc" } });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ mediaItemId: p[0], isTitle: true, boxW: 0.2 });
    // the crop is the rule's: the subject fills 85 % of the crop's height (default framing, tag outside the Composer)
    expect(0.3 / rows[0].cropH).toBeCloseTo(0.85);
    expect(rows.filter((r) => r.isTitle)).toHaveLength(1);
    await expect(addTagExample(t.seiza, p[0], { x: 0.8, y: 0, w: 0.5, h: 0.5 })).rejects.toThrow(/inside the photo/);
  });

  it("the title can change; removing it hands it on", async () => {
    const second = await prisma.tagExample.findFirstOrThrow({ where: { tagId: t.kneeling, mediaItemId: p[1] } });
    await setTitleExample(second.id);
    expect((await getTitleExamples([t.kneeling]))[t.kneeling].url).toContain(`${RUN}/1-512.webp`);
    await removeTagExample(second.id);
    const titles = await prisma.tagExample.findMany({ where: { tagId: t.kneeling, isTitle: true } });
    expect(titles).toHaveLength(1);
  });

  it("the card: definition, examples, confusables with their title, proposals from tagged photos", async () => {
    await addTagExample(t.seiza, p[3], box);
    const card = await getTagCard(t.kneeling);
    expect(card).toMatchObject({ name: `${RUN}-kneeling`, description: "kneeling def" });
    expect(card!.examples).toHaveLength(4);
    expect(card!.confusables).toEqual([
      expect.objectContaining({ id: t.seiza, example: expect.objectContaining({ url: expect.stringContaining(`${RUN}/3-512.webp`) }) }),
    ]);
    expect(card!.proposals.map((x) => x.mediaItemId).sort()).toEqual([p[5], p[6]].sort());
  });

  it("a merge carries examples to the target, at most five, one title", async () => {
    await addTagExample(t.merged, p[6], box);
    await mergeTagDefinitions([t.merged], t.kneeling);
    const rows = await prisma.tagExample.findMany({ where: { tagId: t.kneeling } });
    expect(rows.length).toBe(5);
    expect(rows.filter((r) => r.isTitle)).toHaveLength(1);
  });
});
