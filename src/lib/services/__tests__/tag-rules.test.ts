import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addTagsToEntity,
  getEntityTagIds,
  getSelectionTagCounts,
  setEntityTags,
} from "@/lib/services/entity-tag-service";
import {
  createSlotSet,
  deleteSlotSet,
  getSlotSets,
  setActiveSlotSet,
  setSlot,
} from "@/lib/services/tag-slot-service";
import {
  mergeTagDefinitions,
  rankForEntity,
  updateTagDefinition,
  type TagDefinitionWithGroup,
} from "@/lib/services/tag-service";

// ADR-0033 rules that live in the service layer: the hard group domain, one
// tag per exclusive group (also within a single write), the acyclic parent
// chain, and children following a merge.

const RUN = `ttr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

let personId = "";
let sessionId = "";
let contentGroupId = "";
let exclusiveGroupId = "";
let personGroupId = "";

async function makeTag(groupId: string, name: string, parentId: string | null = null) {
  return prisma.tagDefinition.create({
    data: { groupId, name, slug: `${RUN}-${name}`, nameNorm: name.toLowerCase(), parentId },
  });
}

beforeAll(async () => {
  const person = await prisma.person.create({ data: { icgId: `TTR-${RUN}` } });
  personId = person.id;
  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  sessionId = session.id;
  contentGroupId = (await prisma.tagGroup.create({
    data: { name: `${RUN} content`, slug: `${RUN}-content`, domain: "CONTENT", typicalLevel: "SESSION" },
  })).id;
  exclusiveGroupId = (await prisma.tagGroup.create({
    data: { name: `${RUN} excl`, slug: `${RUN}-excl`, domain: "CONTENT", isExclusive: true },
  })).id;
  personGroupId = (await prisma.tagGroup.create({
    data: { name: `${RUN} person`, slug: `${RUN}-person`, domain: "PERSON" },
  })).id;
});

afterAll(async () => {
  await prisma.tagSlotSet.deleteMany({ where: { name: { startsWith: RUN } } });
  const groupIds = [contentGroupId, exclusiveGroupId, personGroupId].filter(Boolean);
  const tagIds = (await prisma.tagDefinition.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } }))
    .map((t) => t.id);
  await prisma.personTag.deleteMany({ where: { tagDefinitionId: { in: tagIds } } });
  await prisma.sessionTag.deleteMany({ where: { tagDefinitionId: { in: tagIds } } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinitionId: { in: tagIds } } });
  await prisma.tagDefinition.updateMany({ where: { id: { in: tagIds } }, data: { parentId: null } });
  await prisma.tagDefinition.deleteMany({ where: { id: { in: tagIds } } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: groupIds } } });
  if (sessionId) await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  if (personId) await prisma.person.delete({ where: { id: personId } }).catch(() => {});
});

describe("group domain is a hard rule", () => {
  it("refuses a content tag on a person", async () => {
    const beach = await makeTag(contentGroupId, "beach");
    await expect(addTagsToEntity("PERSON", personId, [beach.id])).rejects.toThrow(/cannot be applied to PERSON/);
    expect(await getEntityTagIds("PERSON", personId)).toEqual([]);
  });

  it("refuses a person trait on a session, accepts it on a person", async () => {
    const fitness = await makeTag(personGroupId, "fitness");
    await expect(addTagsToEntity("SESSION", sessionId, [fitness.id])).rejects.toThrow(/cannot be applied to SESSION/);
    await addTagsToEntity("PERSON", personId, [fitness.id]);
    expect(await getEntityTagIds("PERSON", personId)).toEqual([fitness.id]);
  });
});

describe("exclusive groups keep one tag per entity", () => {
  it("a later add replaces the earlier tag of the group", async () => {
    const indoor = await makeTag(exclusiveGroupId, "indoor");
    const outdoor = await makeTag(exclusiveGroupId, "outdoor");
    await addTagsToEntity("SESSION", sessionId, [indoor.id]);
    await addTagsToEntity("SESSION", sessionId, [outdoor.id]);
    const ids = await getEntityTagIds("SESSION", sessionId);
    expect(ids).toContain(outdoor.id);
    expect(ids).not.toContain(indoor.id);
  });

  it("two tags of the group in one write keep only the last", async () => {
    const studio = await makeTag(exclusiveGroupId, "studio");
    const indoor = await prisma.tagDefinition.findFirstOrThrow({ where: { groupId: exclusiveGroupId, name: "indoor" } });
    await setEntityTags("SESSION", sessionId, [studio.id, indoor.id]);
    const ids = await getEntityTagIds("SESSION", sessionId);
    expect(ids).toEqual([indoor.id]);
  });
});

describe("hierarchy", () => {
  it("rejects a parent that would close a cycle", async () => {
    const swimwear = await makeTag(contentGroupId, "swimwear");
    const bikini = await makeTag(contentGroupId, "bikini", swimwear.id);
    await expect(updateTagDefinition(swimwear.id, { parentId: bikini.id })).rejects.toThrow(/cycle/);
    await expect(updateTagDefinition(swimwear.id, { parentId: swimwear.id })).rejects.toThrow(/own parent/);
  });

  it("merging a tag moves its children to the target without self-parenting it", async () => {
    const wear = await makeTag(contentGroupId, "wear");
    const oldParent = await makeTag(contentGroupId, "beachwear");
    const child = await makeTag(contentGroupId, "sarong", oldParent.id);
    // The target itself hangs under the source: it must be detached, not made its own parent
    await prisma.tagDefinition.update({ where: { id: wear.id }, data: { parentId: oldParent.id } });

    await mergeTagDefinitions([oldParent.id], wear.id);

    const [movedChild, target] = await Promise.all([
      prisma.tagDefinition.findUniqueOrThrow({ where: { id: child.id } }),
      prisma.tagDefinition.findUniqueOrThrow({ where: { id: wear.id } }),
    ]);
    expect(movedChild.parentId).toBe(wear.id);
    expect(target.parentId).toBeNull();
    const alias = await prisma.tagAlias.findFirst({ where: { tagDefinitionId: wear.id, name: "beachwear" } });
    expect(alias).not.toBeNull();
  });
});

describe("picker ranking by typical level", () => {
  it("puts tags whose level is the entity first, otherwise keeps order", () => {
    const group = { typicalLevel: null } as const;
    const tags = [
      { id: "a", typicalLevel: null, group },
      { id: "b", typicalLevel: "MEDIA_ITEM" as const, group },
      { id: "c", typicalLevel: null, group: { typicalLevel: "MEDIA_ITEM" as const } },
      { id: "d", typicalLevel: "SESSION" as const, group },
    ];
    // rankForEntity only reads typicalLevel + group.typicalLevel
    type RankInput = TagDefinitionWithGroup & { id: string };
    const input = tags as unknown as RankInput[];
    expect(rankForEntity(input, "MEDIA_ITEM").map((t) => t.id)).toEqual(["b", "c", "a", "d"]);
    expect(rankForEntity(input, "PERSON").map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("selection counts (tri-state bulk palette)", () => {
  it("counts how many selected entities carry each tag", async () => {
    const extra = await prisma.session.create({ data: { name: `${RUN} session 2` } });
    try {
      const location = await makeTag(contentGroupId, "loc-count");
      await addTagsToEntity("SESSION", sessionId, [location.id]);
      const counts = await getSelectionTagCounts("SESSION", [sessionId, extra.id]);
      expect(counts[location.id]).toBe(1);
      await addTagsToEntity("SESSION", extra.id, [location.id]);
      expect((await getSelectionTagCounts("SESSION", [sessionId, extra.id]))[location.id]).toBe(2);
    } finally {
      await prisma.sessionTag.deleteMany({ where: { sessionId: extra.id } });
      await prisma.session.delete({ where: { id: extra.id } });
    }
  });
});

describe("quick-tag slot sets", () => {
  it("keeps exactly one set active and follows a merged tag", async () => {
    const before = (await getSlotSets()).find((s) => s.isActive)?.id;
    const a = await createSlotSet(`${RUN} A`);
    const b = await createSlotSet(`${RUN} B`);
    let sets = await getSlotSets();
    expect(sets.filter((s) => s.isActive).map((s) => s.id)).toEqual([b]);
    await setActiveSlotSet(a);
    sets = await getSlotSets();
    expect(sets.filter((s) => s.isActive).map((s) => s.id)).toEqual([a]);

    const src = await makeTag(contentGroupId, "slot-src");
    const dst = await makeTag(contentGroupId, "slot-dst");
    await setSlot(a, 3, src.id);
    await expect(setSlot(a, 10, src.id)).rejects.toThrow(/1–9/);
    await mergeTagDefinitions([src.id], dst.id);
    const slot = await prisma.tagSlot.findUniqueOrThrow({ where: { slotSetId_position: { slotSetId: a, position: 3 } } });
    expect(slot.tagDefinitionId).toBe(dst.id);

    // Deleting the active set hands "active" on
    await deleteSlotSet(a);
    sets = await getSlotSets();
    expect(sets.filter((s) => s.isActive)).toHaveLength(1);
    await deleteSlotSet(b);
    if (before) await setActiveSlotSet(before).catch(() => {});
  });
});
