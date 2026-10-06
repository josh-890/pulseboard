import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTagAlias, findTagNameClashes } from "@/lib/services/tag-service";

// The naming guide's soft guard: a name already used by a tag (or alias) in
// another group is reported, the tag's own name is not.
const RUN = `tnc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const a = await prisma.tagGroup.create({ data: { name: `${RUN}a`, slug: `${RUN}a`, domain: "CONTENT" } });
  const b = await prisma.tagGroup.create({ data: { name: `${RUN}b`, slug: `${RUN}b`, domain: "CONTENT" } });
  ids.a = a.id;
  ids.b = b.id;
  ids.red = (await prisma.tagDefinition.create({ data: { groupId: a.id, name: `${RUN} Red`, slug: `${RUN}-red`, nameNorm: `${RUN} red` } })).id;
  ids.other = (await prisma.tagDefinition.create({ data: { groupId: b.id, name: `${RUN} Other`, slug: `${RUN}-other`, nameNorm: `${RUN} other` } })).id;
  await createTagAlias(ids.other, `${RUN} crimson`);
});

afterAll(async () => {
  await prisma.tagAlias.deleteMany({ where: { tagDefinitionId: { in: [ids.red, ids.other] } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: [ids.a, ids.b] } } });
  await prisma.tagGroup.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
});

describe("findTagNameClashes", () => {
  it("finds the same name, also written differently (same slug)", async () => {
    const c = await findTagNameClashes(`${RUN}-RED`);
    expect(c).toEqual([{ tagId: ids.red, tagName: `${RUN} Red`, groupName: `${RUN}a`, via: "name" }]);
  });

  it("finds an alias that already means another tag", async () => {
    const c = await findTagNameClashes(`${RUN} Crimson`);
    expect(c).toMatchObject([{ tagId: ids.other, via: "alias" }]);
  });

  it("does not report the tag being renamed, nor a fresh name", async () => {
    expect(await findTagNameClashes(`${RUN} Red`, { excludeId: ids.red })).toEqual([]);
    expect(await findTagNameClashes(`${RUN} blue`)).toEqual([]);
  });
});

describe("the one spelling is enforced on save", () => {
  it("create and rename store kebab-case; a slug change keeps the old name as alias", async () => {
    const { createTagDefinition, updateTagDefinition } = await import("@/lib/services/tag-service");
    const t = await createTagDefinition({ groupId: ids.a, name: `${RUN} Golden Hour` });
    expect(t.name).toBe(`${RUN}-golden-hour`);
    expect(t.slug).toBe(t.name);
    const r = await updateTagDefinition(t.id, { name: `${RUN} Nägel` });
    expect(r.name).toBe(`${RUN}-naegel`);
    expect(await prisma.tagAlias.count({ where: { tagDefinitionId: t.id, name: `${RUN}-golden-hour` } })).toBe(1);
    await prisma.tagAlias.deleteMany({ where: { tagDefinitionId: t.id } });
    await prisma.tagDefinition.delete({ where: { id: t.id } });
  });

  it("refuses a name without letters or digits", async () => {
    const { createTagDefinition } = await import("@/lib/services/tag-service");
    await expect(createTagDefinition({ groupId: ids.a, name: "!!!" })).rejects.toThrow(/no letters or digits/);
  });
});
