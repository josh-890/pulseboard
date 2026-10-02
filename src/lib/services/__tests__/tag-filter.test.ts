import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { parseTagQuery, resolveTagQuery } from "@/lib/tag-query";
import { findTagMatchIds, getTagFacetCounts, loadTagCatalog } from "@/lib/services/tag-filter-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";

// ADR-0033 S4: the SQL filter must answer exactly what resolveEffectiveTags
// shows. Fixture — one production with one set:
//
//   Session S   setting:outdoor (exclusive) · mood:night · workflow:review
//   Set A ∈ S   outfit:bikini (⊂ swimwear)
//   m1 ∈ S, A   setting:studio            ← shadows the session's outdoor
//   m2 ∈ S, A   —
//   m3 ∈ S      —                          ← not in the set

const RUN = `ttf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ids: Record<string, string> = {};
const g = (slug: string) => `${RUN}-${slug}`;

beforeAll(async () => {
  const group = async (slug: string, data: { isExclusive?: boolean; kind?: "WORKFLOW"; domain?: "CONTENT" | "ANY" }) =>
    (await prisma.tagGroup.create({ data: { name: g(slug), slug: g(slug), domain: data.domain ?? "CONTENT", isExclusive: data.isExclusive ?? false, kind: data.kind ?? "DESCRIPTIVE" } })).id;
  const setting = await group("setting", { isExclusive: true });
  const mood = await group("mood", {});
  const outfit = await group("outfit", {});
  const workflow = await group("workflow", { kind: "WORKFLOW", domain: "ANY" });
  const tag = async (groupId: string, slug: string, parentId: string | null = null) =>
    (ids[slug] = (await prisma.tagDefinition.create({ data: { groupId, name: slug, slug, nameNorm: slug, parentId } })).id);
  await tag(setting, "outdoor");
  await tag(setting, "studio");
  await tag(mood, "night");
  await tag(outfit, "swimwear");
  await tag(outfit, "bikini", ids.swimwear);
  await tag(workflow, "review");

  const session = await prisma.session.create({ data: { name: `${RUN} S` } });
  const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} A` } });
  ids.S = session.id;
  ids.A = set.id;
  await prisma.setSession.create({ data: { setId: set.id, sessionId: session.id } });
  const media = async (name: string, inSet: boolean) => {
    const m = await prisma.mediaItem.create({
      data: { sessionId: session.id, mediaType: "PHOTO", filename: name, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
    });
    if (inSet) await prisma.setMediaItem.create({ data: { setId: set.id, mediaItemId: m.id } });
    ids[name] = m.id;
  };
  await media("m1", true);
  await media("m2", true);
  await media("m3", false);

  await prisma.sessionTag.createMany({
    data: ["outdoor", "night", "review"].map((t) => ({ sessionId: session.id, tagDefinitionId: ids[t] })),
  });
  await prisma.setTag.create({ data: { setId: set.id, tagDefinitionId: ids.bikini } });
  await prisma.mediaItemTag.create({ data: { mediaItemId: ids.m1, tagDefinitionId: ids.studio } });
});

afterAll(async () => {
  const media = [ids.m1, ids.m2, ids.m3].filter(Boolean);
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: media } } });
  await prisma.mediaItem.deleteMany({ where: { id: { in: media } } });
  if (ids.A) {
    await prisma.setTag.deleteMany({ where: { setId: ids.A } });
    await prisma.setSession.deleteMany({ where: { setId: ids.A } });
    await prisma.set.delete({ where: { id: ids.A } });
  }
  if (ids.S) {
    await prisma.sessionTag.deleteMany({ where: { sessionId: ids.S } });
    await prisma.session.delete({ where: { id: ids.S } });
  }
  const groups = await prisma.tagGroup.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const groupIds = groups.map((x) => x.id);
  await prisma.tagDefinition.updateMany({ where: { groupId: { in: groupIds } }, data: { parentId: null } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: groupIds } } });
});

async function match(entity: "MEDIA_ITEM" | "SET", text: string, within: string[]) {
  // Fixture slugs are unique to this run, so qualify them with the run's group slugs
  const qualified = text.replace(/\b(setting|mood|outfit|workflow):/g, (_, grp: string) => `${g(grp)}:`);
  const resolved = resolveTagQuery(parseTagQuery(qualified).query, await loadTagCatalog());
  const found = await findTagMatchIds(entity, resolved, within);
  return Object.entries(ids)
    .filter(([, id]) => found.includes(id))
    .map(([name]) => name)
    .sort();
}

const MEDIA = () => [ids.m1, ids.m2, ids.m3];

describe("tag filter SQL (images)", () => {
  it("anywhere: an image's own exclusive tag shadows the session's", async () => {
    expect(await match("MEDIA_ITEM", "setting:outdoor", MEDIA())).toEqual(["m2", "m3"]);
    expect(await match("MEDIA_ITEM", "setting:studio", MEDIA())).toEqual(["m1"]);
  });

  it("strict session level ignores the shadowing", async () => {
    expect(await match("MEDIA_ITEM", "@session:setting:outdoor", MEDIA())).toEqual(["m1", "m2", "m3"]);
    expect(await match("MEDIA_ITEM", "@image:setting:outdoor", MEDIA())).toEqual([]);
  });

  it("a parent tag finds its sub-tag inherited from the set; exact does not", async () => {
    expect(await match("MEDIA_ITEM", "outfit:swimwear", MEDIA())).toEqual(["m1", "m2"]);
    expect(await match("MEDIA_ITEM", "=outfit:swimwear", MEDIA())).toEqual([]);
    expect(await match("MEDIA_ITEM", "@set:outfit:bikini", MEDIA())).toEqual(["m1", "m2"]);
  });

  it("workflow tags never inherit", async () => {
    expect(await match("MEDIA_ITEM", "workflow:review", MEDIA())).toEqual([]);
  });

  it("combines AND, OR and NOT", async () => {
    expect(await match("MEDIA_ITEM", "mood:night -setting:studio", MEDIA())).toEqual(["m2", "m3"]);
    expect(await match("MEDIA_ITEM", "setting:studio,outdoor outfit:bikini", MEDIA())).toEqual(["m1", "m2"]);
  });
});

describe("tag filter SQL (sets)", () => {
  it("a set inherits from its session, strictly or not", async () => {
    expect(await match("SET", "setting:outdoor", [ids.A])).toEqual(["A"]);
    expect(await match("SET", "@set:setting:outdoor", [ids.A])).toEqual([]);
    expect(await match("SET", "@session:setting:outdoor", [ids.A])).toEqual(["A"]);
  });
});

describe("facet counts agree with getEffectiveTags", () => {
  it("counts each image's effective (non-overridden) tags", async () => {
    const counts = await getTagFacetCounts("MEDIA_ITEM", MEDIA());
    expect(counts[ids.outdoor]).toBe(2);
    expect(counts[ids.studio]).toBe(1);
    expect(counts[ids.night]).toBe(3);
    expect(counts[ids.bikini]).toBe(2);
    expect(counts[ids.review]).toBeUndefined();

    const expected: Record<string, number> = {};
    for (const m of MEDIA()) {
      for (const t of await getEffectiveTags("MEDIA_ITEM", m)) {
        if (!t.overridden) expected[t.id] = (expected[t.id] ?? 0) + 1;
      }
    }
    expect(counts).toEqual(expected);
  });
});
