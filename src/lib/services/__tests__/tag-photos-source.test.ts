import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import type { TaggableEntity } from "@/lib/tag-domains";

// `@photos:` (ADR-0042, S5): a set or session whose photos carry a tag — photo-
// level Composer tags rolled up. Against the DEV database; rows carry RUN.

const RUN = `phs${Date.now().toString(36)}`;
let groupId = "";
let heels = "";
let shoes = "";
let sessionA = "";
let sessionB = "";
const sets: Record<string, string> = {};

const match = async (entity: TaggableEntity, q: string, within: string[]) => {
  const f = await resolveTagFilterParam(q, entity);
  return (await findTagMatchIds(entity, f!.resolved, within)).sort();
};

beforeAll(async () => {
  groupId = (await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT", typicalLevel: "MEDIA_ITEM" } })).id;
  shoes = (await prisma.tagDefinition.create({ data: { groupId, name: `${RUN}-shoes`, slug: `${RUN}-shoes`, nameNorm: `${RUN}-shoes` } })).id;
  heels = (await prisma.tagDefinition.create({ data: { groupId, name: `${RUN}-heels`, slug: `${RUN}-heels`, nameNorm: `${RUN}-heels`, parentId: shoes } })).id;
  sessionA = (await prisma.session.create({ data: { name: `${RUN} A` } })).id;
  sessionB = (await prisma.session.create({ data: { name: `${RUN} B` } })).id;
  for (const k of ["withHeels", "artOnly", "none"]) sets[k] = (await prisma.set.create({ data: { type: "photo", title: `${RUN} ${k}` } })).id;
  const photo = async (sessionId: string, setId: string, role: "PHOTO" | "COVER_ART", tag: boolean) => {
    const m = await prisma.mediaItem.create({
      data: { sessionId, mediaType: "PHOTO", role, filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, fileRef: "x" },
    });
    await prisma.setMediaItem.create({ data: { setId, mediaItemId: m.id, sortOrder: 0 } });
    if (tag) await prisma.mediaItemTag.create({ data: { mediaItemId: m.id, tagDefinitionId: heels } });
  };
  await photo(sessionA, sets.withHeels, "PHOTO", true);
  await photo(sessionA, sets.withHeels, "PHOTO", false);
  await photo(sessionB, sets.artOnly, "COVER_ART", true); // cover art never counts
  await photo(sessionB, sets.none, "PHOTO", false);
});

afterAll(async () => {
  const media = await prisma.mediaItem.findMany({ where: { sessionId: { in: [sessionA, sessionB] } }, select: { id: true } });
  const ids = media.map((m) => m.id);
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: ids } } });
  await prisma.set.deleteMany({ where: { id: { in: Object.values(sets) } } });
  await prisma.session.deleteMany({ where: { id: { in: [sessionA, sessionB] } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId, parentId: { not: null } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId } });
  await prisma.tagGroup.delete({ where: { id: groupId } });
});

describe("@photos:", () => {
  it("finds the sets whose photos carry the tag — and its parent through implication", async () => {
    const all = Object.values(sets);
    expect(await match("SET", `@photos:${RUN}-heels`, all)).toEqual([sets.withHeels]);
    expect(await match("SET", `@photos:${RUN}-shoes`, all)).toEqual([sets.withHeels]);
    expect(await match("SET", `${RUN}-heels`, all), "a plain set search stays on the set's own tags").toEqual([]);
    expect(await match("SET", `-@photos:${RUN}-heels`, all)).toEqual([sets.artOnly, sets.none].sort());
  });

  it("works for sessions too", async () => {
    expect(await match("SESSION", `@photos:${RUN}-heels`, [sessionA, sessionB])).toEqual([sessionA]);
  });
});
