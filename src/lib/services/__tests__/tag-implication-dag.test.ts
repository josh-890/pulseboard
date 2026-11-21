import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { mergeTagDefinitions, setExtraParents, updateTagDefinition } from "@/lib/services/tag-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";

// Several parents per tag (ADR-0042): torn-pantyhose implies pantyhose (its
// parentId) and torn-clothes (a further parent). Against the DEV database;
// throwaway rows carry RUN.

const RUN = `dag${Date.now().toString(36)}`;
const t: Record<string, string> = {};
let groupId = "";
const photos: Record<string, string> = {};
let sessionId = "";

const tag = async (key: string, parentKey?: string) =>
  (t[key] = (
    await prisma.tagDefinition.create({
      data: { groupId, name: `${RUN}-${key}`, slug: `${RUN}-${key}`, nameNorm: `${RUN}-${key}`, parentId: parentKey ? t[parentKey] : null },
    })
  ).id);

const photoWith = async (key: string, tagKey: string) => {
  const m = await prisma.mediaItem.create({
    data: { sessionId, mediaType: "PHOTO", filename: `${RUN}-${key}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, fileRef: "x" },
  });
  await prisma.mediaItemTag.create({ data: { mediaItemId: m.id, tagDefinitionId: t[tagKey] } });
  photos[key] = m.id;
};

const match = async (q: string) => {
  const f = await resolveTagFilterParam(q, "MEDIA_ITEM");
  return (await findTagMatchIds("MEDIA_ITEM", f!.resolved, Object.values(photos))).sort();
};

beforeAll(async () => {
  groupId = (await prisma.tagGroup.create({ data: { name: RUN, slug: RUN, domain: "CONTENT" } })).id;
  sessionId = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  await tag("pantyhose");
  await tag("torn-clothes");
  await tag("torn-pantyhose", "pantyhose");
  await tag("wet-clothes");
  await tag("other");
  await photoWith("torn", "torn-pantyhose");
  await photoWith("plain", "pantyhose");
  await photoWith("other", "other");
});

afterAll(async () => {
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: Object.values(photos) } } });
  await prisma.mediaItem.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { groupId } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId } });
  await prisma.tagGroup.delete({ where: { id: groupId } });
});

describe("several parents", () => {
  it("a filter on any parent finds the tag that implies it", async () => {
    await setExtraParents(t["torn-pantyhose"], [t["torn-clothes"]]);
    expect(await match(`${RUN}-pantyhose`)).toEqual([photos.plain, photos.torn].sort());
    expect(await match(`${RUN}-torn-clothes`)).toEqual([photos.torn]);
    expect(await match(`=${RUN}-torn-clothes`), "= stays literal").toEqual([]);
  });

  it("the query box reads a Danbooru spelling in the one spelling", async () => {
    expect(await match(`${RUN.toUpperCase()}_PANTYHOSE`)).toEqual([photos.plain, photos.torn].sort());
  });

  it("the first parent is never repeated among the further parents", async () => {
    await setExtraParents(t["torn-pantyhose"], [t.pantyhose, t["torn-clothes"]]);
    const rows = await prisma.tagExtraParent.findMany({ where: { tagId: t["torn-pantyhose"] } });
    expect(rows.map((r) => r.parentId)).toEqual([t["torn-clothes"]]);
  });

  it("refuses a cycle through a mix of both kinds of edge", async () => {
    // torn-pantyhose ⊂ torn-clothes (extra); torn-clothes ⊂ torn-pantyhose would close it
    await expect(updateTagDefinition(t["torn-clothes"], { parentId: t["torn-pantyhose"] })).rejects.toThrow(/cycle/);
    await expect(setExtraParents(t.pantyhose, [t["torn-pantyhose"]])).rejects.toThrow(/cycle/);
  });

  it("making a further parent the first parent drops the duplicate edge", async () => {
    await updateTagDefinition(t["torn-pantyhose"], { parentId: t["torn-clothes"] });
    expect(await prisma.tagExtraParent.count({ where: { tagId: t["torn-pantyhose"] } })).toBe(0);
    await updateTagDefinition(t["torn-pantyhose"], { parentId: t.pantyhose });
    await setExtraParents(t["torn-pantyhose"], [t["torn-clothes"]]);
  });

  it("a merge carries further parents to the target", async () => {
    // wet-clothes is merged into torn-clothes: nothing points at wet-clothes yet,
    // so give it an edge first and see it land on the target
    await setExtraParents(t.other, [t["wet-clothes"]]);
    await mergeTagDefinitions([t["wet-clothes"]], t["torn-clothes"]);
    const rows = await prisma.tagExtraParent.findMany({ where: { tagId: t.other } });
    expect(rows.map((r) => r.parentId)).toEqual([t["torn-clothes"]]);
    expect(await match(`${RUN}-torn-clothes`)).toEqual([photos.other, photos.torn].sort());
  });
});
