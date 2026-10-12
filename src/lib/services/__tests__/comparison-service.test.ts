import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getComparisonDetail, getComparisonsForCollection } from "@/lib/services/comparison-service";

// The comparison list carries everything the grid tile, the viewer and compose
// mode draw (2026-10-12): members in order, the aspect-driver, focal points and
// thumb / view / zoom sources.

const RUN = `cmp${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  const photo = (name: string, w: number, h: number) =>
    prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        mediaType: "PHOTO",
        filename: name,
        mimeType: "image/jpeg",
        size: 1,
        originalWidth: w,
        originalHeight: h,
        variants: { gallery_512: `${RUN}/${name}/g.webp`, full_2400: `${RUN}/${name}/f.webp`, master_4000: `${RUN}/${name}/m.webp` },
      },
    });
  const a = await photo("a", 2000, 3000);
  const b = await photo("b", 3000, 2000);
  const collection = await prisma.mediaCollection.create({ data: { name: `${RUN} collection`, layout: "SIDE_BY_SIDE" } });
  const comparison = await prisma.comparison.create({
    data: {
      collectionId: collection.id,
      title: `${RUN} pair`,
      aspectDriverMediaItemId: b.id,
      items: {
        create: [
          { mediaItemId: a.id, sortOrder: 0, focalX: 0.2, focalY: 0.3 },
          { mediaItemId: b.id, sortOrder: 1 },
        ],
      },
    },
  });
  Object.assign(ids, { session: session.id, a: a.id, b: b.id, collection: collection.id, comparison: comparison.id });
});

afterAll(async () => {
  await prisma.mediaCollection.deleteMany({ where: { id: ids.collection } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: [ids.a, ids.b].filter(Boolean) } } });
  await prisma.session.deleteMany({ where: { id: ids.session } });
});

describe("getComparisonsForCollection", () => {
  it("returns each comparison complete, members in order", async () => {
    const [c] = await getComparisonsForCollection(ids.collection);
    expect(c).toMatchObject({ id: ids.comparison, title: `${RUN} pair`, memberCount: 2, aspectDriverMediaItemId: ids.b });
    expect(c.members.map((m) => m.mediaItemId)).toEqual([ids.a, ids.b]);
    expect(c.members[0]).toMatchObject({ focalX: 0.2, focalY: 0.3, isAspectDriver: false, originalWidth: 2000 });
    expect(c.members[1].isAspectDriver).toBe(true);
  });

  it("gives thumb, view and the sharper zoom source", async () => {
    const [c] = await getComparisonsForCollection(ids.collection);
    const m = c.members[0];
    expect(m.thumbUrl).toContain(`${RUN}/a/g.webp`);
    expect(m.viewUrl).toContain(`${RUN}/a/f.webp`);
    expect(m.zoomUrl).toContain(`${RUN}/a/m.webp`);
  });

  it("matches the single-comparison read", async () => {
    const [c] = await getComparisonsForCollection(ids.collection);
    const { memberCount, ...detail } = c;
    expect(memberCount).toBe(2);
    expect(await getComparisonDetail(ids.comparison)).toEqual(detail);
  });
});
