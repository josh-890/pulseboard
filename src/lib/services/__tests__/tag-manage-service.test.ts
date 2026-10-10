import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { checkTagMove, deleteTags, moveTagsToGroup, setTagsParent } from "@/lib/services/tag-manage-service";

// Moving tags between groups and acting on several at once (2026-10-10): a move
// is checked first and refused with numbers — never resolved by guessing.

const RUN = `tms${Date.now().toString(36)}`;
const g: Record<string, string> = {};
const t: Record<string, string> = {};
const sets: string[] = [];

const group = async (key: string, domain: "CONTENT" | "PERSON", isExclusive = false) =>
  (g[key] = (await prisma.tagGroup.create({ data: { name: `${RUN}-${key}`, slug: `${RUN}-${key}`, domain, isExclusive } })).id);
const tag = async (key: string, groupKey: string, parentKey?: string) =>
  (t[key] = (
    await prisma.tagDefinition.create({
      data: { groupId: g[groupKey], name: `${RUN}-${key}`, slug: `${RUN}-${key}`, nameNorm: `${RUN}-${key}`, parentId: parentKey ? t[parentKey] : null },
    })
  ).id);
const setWith = async (...tagKeys: string[]) => {
  const s = await prisma.set.create({ data: { type: "photo", title: `${RUN} set ${sets.length}` } });
  sets.push(s.id);
  await prisma.setTag.createMany({ data: tagKeys.map((k) => ({ setId: s.id, tagDefinitionId: t[k] })) });
  return s.id;
};

beforeAll(async () => {
  await group("a", "CONTENT");
  await group("a2", "CONTENT");
  await group("x", "CONTENT", true);
  await group("p", "PERSON");
  await tag("a1", "a");
  await tag("a1c", "a", "a1");
  await tag("a2", "a");
  await tag("x1", "x");
  await tag("dup", "a");
  await tag("dupx", "x");
  await prisma.tagDefinition.update({ where: { id: t.dupx }, data: { slug: `${RUN}-dup`, name: `${RUN}-dup`, nameNorm: `${RUN}-dup` } });
  await setWith("a1", "a2");
  await setWith("x1", "dup");
});

afterAll(async () => {
  await prisma.setTag.deleteMany({ where: { setId: { in: sets } } });
  await prisma.set.deleteMany({ where: { id: { in: sets } } });
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { groupId: { in: Object.values(g) } } } });
  await prisma.tagDefinition.updateMany({ where: { groupId: { in: Object.values(g) } }, data: { parentId: null } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: Object.values(g) } } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: Object.values(g) } } });
});

describe("checkTagMove", () => {
  it("takes same-group sub-tags along by default", async () => {
    const c = await checkTagMove([t.a1], g.a2);
    expect(c.tagIds.sort()).toEqual([t.a1, t.a1c].sort());
    expect(c.conflicts).toEqual([]);
    expect((await checkTagMove([t.a1], g.a2, { withSubTags: false })).tagIds).toEqual([t.a1]);
  });

  it("refuses a domain the items do not fit, with the number", async () => {
    const c = await checkTagMove([t.a1], g.p);
    expect(c.conflicts).toEqual([{ kind: "domain", entity: "SET", noun: "sets", count: 1 }]);
  });

  it("refuses two tags of an exclusive group on one item", async () => {
    // set 0 carries a1 and a2: both into the exclusive group collide
    expect((await checkTagMove([t.a1, t.a2], g.x, { withSubTags: false })).conflicts).toEqual([
      { kind: "exclusive", entity: "SET", noun: "sets", count: 1 },
    ]);
    // set 1 already carries x1 there; moving dup in would add a second
    const c = await checkTagMove([t.dup], g.x);
    expect(c.conflicts).toContainEqual({ kind: "exclusive", entity: "SET", noun: "sets", count: 1 });
    // a1 alone: no item has another tag of the group
    expect((await checkTagMove([t.a1], g.x, { withSubTags: false })).conflicts).toEqual([]);
  });

  it("reports a tag of the same name in the target group", async () => {
    const c = await checkTagMove([t.dup], g.x);
    expect(c.conflicts).toContainEqual({ kind: "name", tagId: t.dup, existingId: t.dupx, name: `${RUN}-dup` });
  });
});

describe("moveTagsToGroup", () => {
  it("moves the tag and its sub-tags, keeping the parent link", async () => {
    expect(await moveTagsToGroup([t.a1], g.a2)).toEqual({ moved: 2 });
    const moved = await prisma.tagDefinition.findMany({ where: { id: { in: [t.a1, t.a1c] } }, select: { groupId: true, parentId: true, id: true } });
    expect(moved.every((m) => m.groupId === g.a2)).toBe(true);
    expect(moved.find((m) => m.id === t.a1c)?.parentId).toBe(t.a1);
  });

  it("writes nothing when the check finds a conflict", async () => {
    const r = await moveTagsToGroup([t.a2], g.p);
    expect(r).toMatchObject({ moved: 0, conflicts: [{ kind: "domain" }] });
    expect((await prisma.tagDefinition.findUniqueOrThrow({ where: { id: t.a2 } })).groupId).toBe(g.a);
  });
});

describe("bulk", () => {
  it("sets a parent for several tags and deletes several", async () => {
    await tag("b1", "a");
    await tag("b2", "a");
    expect(await setTagsParent([t.b1, t.b2], t.a2)).toBe(2);
    expect((await prisma.tagDefinition.findUniqueOrThrow({ where: { id: t.b2 } })).parentId).toBe(t.a2);
    expect(await deleteTags([t.b1, t.b2])).toBe(2);
    expect(await prisma.tagDefinition.count({ where: { id: { in: [t.b1, t.b2] } } })).toBe(0);
  });
});
