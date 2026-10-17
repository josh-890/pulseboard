import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteTagDefinition, mergeTagDefinitions, updateTagDefinition } from "@/lib/services/tag-service";
import { deleteTags } from "@/lib/services/tag-manage-service";

// The photo marks' tags (2026-10-17) can't be renamed, merged away or deleted.
// Runs against the DEV database on throwaway tags of the same slug in a group of
// its own, so a failing guard never touches the real marks.

const RUN = `ptg${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const group = await prisma.tagGroup.create({ data: { name: `${RUN} Marks`, slug: `${RUN}-marks` } });
  ids.group = group.id;
  for (const slug of ["iconic", "outtake", `${RUN}-plain`, `${RUN}-other`]) {
    const t = await prisma.tagDefinition.create({ data: { groupId: group.id, name: slug, slug, nameNorm: slug } });
    ids[slug] = t.id;
  }
});

afterAll(async () => {
  if (!ids.group) return;
  await prisma.tagAlias.deleteMany({ where: { tagDefinition: { groupId: ids.group } } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: ids.group } });
  await prisma.tagGroup.delete({ where: { id: ids.group } });
});

const exists = async (id: string) => !!(await prisma.tagDefinition.findUnique({ where: { id } }));

describe("protected tags (the photo marks)", () => {
  it("can't be deleted — one at a time or in a selection, where nothing is deleted at all", async () => {
    await expect(deleteTagDefinition(ids.iconic)).rejects.toThrow(/photo mark/);
    await expect(deleteTags([ids[`${RUN}-plain`], ids.outtake])).rejects.toThrow(/photo mark/);
    expect(await exists(ids.iconic)).toBe(true);
    expect(await exists(ids.outtake)).toBe(true);
    expect(await exists(ids[`${RUN}-plain`])).toBe(true);
  });

  it("can't be merged into another tag, but another tag can be merged into one", async () => {
    await expect(mergeTagDefinitions([ids.outtake], ids[`${RUN}-other`])).rejects.toThrow(/photo mark/);
    expect(await exists(ids.outtake)).toBe(true);
    await mergeTagDefinitions([ids[`${RUN}-plain`]], ids.outtake);
    expect(await exists(ids[`${RUN}-plain`])).toBe(false);
  });

  it("can't be renamed, but its description can change", async () => {
    await expect(updateTagDefinition(ids.iconic, { name: "signature" })).rejects.toThrow(/photo mark/);
    await updateTagDefinition(ids.iconic, { name: "iconic", description: "the person's signature photos" });
    const tag = await prisma.tagDefinition.findUniqueOrThrow({ where: { id: ids.iconic } });
    expect(tag).toMatchObject({ name: "iconic", slug: "iconic", description: "the person's signature photos" });
  });

  it("other tags are unaffected", async () => {
    await deleteTagDefinition(ids[`${RUN}-other`]);
    expect(await exists(ids[`${RUN}-other`])).toBe(false);
  });
});
