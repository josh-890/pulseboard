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
