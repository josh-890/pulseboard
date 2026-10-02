import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createSavedFilter,
  evaluateSmartQuery,
  freezeSmartCollection,
  getSmartCollections,
  importSavedFilters,
  listSavedFilters,
  normaliseParams,
} from "@/lib/services/saved-filter-service";

// ADR-0033 S6: saved filters for every browser; scope "media" = smart collection.

const RUN = `tsf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const group = await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT" } });
  ids.group = group.id;
  ids.tag = (await prisma.tagDefinition.create({ data: { groupId: group.id, name: "glow", slug: "glow", nameNorm: "glow" } })).id;
  const session = await prisma.session.create({ data: { name: `${RUN} S` } });
  ids.session = session.id;
  const m = await prisma.mediaItem.create({
    data: { sessionId: session.id, mediaType: "PHOTO", filename: "a.jpg", mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
  });
  ids.media = m.id;
  await prisma.mediaItemTag.create({ data: { mediaItemId: m.id, tagDefinitionId: ids.tag } });
});

afterAll(async () => {
  await prisma.savedFilter.deleteMany({ where: { name: { startsWith: RUN } } });
  const cols = await prisma.mediaCollection.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  await prisma.mediaCollectionItem.deleteMany({ where: { collectionId: { in: cols.map((c) => c.id) } } });
  await prisma.mediaCollection.deleteMany({ where: { id: { in: cols.map((c) => c.id) } } });
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: ids.media } });
  await prisma.mediaItem.deleteMany({ where: { id: ids.media } });
  await prisma.session.deleteMany({ where: { id: ids.session } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: ids.group } });
  await prisma.tagGroup.deleteMany({ where: { id: ids.group } });
});

describe("saved filters", () => {
  it("strips paging from the saved params", () => {
    expect(normaliseParams("?status=active&loaded=150&tags=a")).toBe("status=active&tags=a");
  });

  it("refuses a duplicate name within a scope, allows it in another", async () => {
    await createSavedFilter("sets", `${RUN} view`, "type=video");
    await expect(createSavedFilter("sets", `${RUN} view`, "type=photo")).rejects.toThrow(/already exists/);
    await expect(createSavedFilter("people", `${RUN} view`, "status=active")).resolves.toBeTruthy();
  });

  it("imports legacy views once, skipping names already present", async () => {
    const added = await importSavedFilters("sets", [
      { name: `${RUN} view`, params: "x=1" },
      { name: `${RUN} other`, params: "y=2&loaded=100" },
    ]);
    expect(added).toBe(1);
    const mine = (await listSavedFilters("sets")).filter((r) => r.name.startsWith(RUN));
    expect(mine.map((r) => [r.name, r.params])).toEqual([
      [`${RUN} view`, "type=video"],
      [`${RUN} other`, "y=2"],
    ]);
  });
});

describe("smart collections", () => {
  it("evaluates live and freezes into a static collection", async () => {
    const query = `${RUN}:glow`;
    expect((await evaluateSmartQuery(query)).ids).toEqual([ids.media]);

    const id = await createSavedFilter("media", `${RUN} smart`, `tags=${encodeURIComponent(query)}`);
    const summary = (await getSmartCollections()).find((s) => s.id === id);
    expect(summary).toMatchObject({ query, count: 1 });

    const { collectionId, count } = await freezeSmartCollection(id, `${RUN} frozen`);
    expect(count).toBe(1);
    const members = await prisma.mediaCollectionItem.findMany({ where: { collectionId }, select: { mediaItemId: true } });
    expect(members.map((m) => m.mediaItemId)).toEqual([ids.media]);
  });
});
