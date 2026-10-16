import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getMarkTags } from "@/lib/services/media-mark-service";

// The photo marks iconic / outtake (2026-10-16) are the Judgment group's tags of
// that name — created there when missing. Runs against the DEV database.

const RUN = `mms${Date.now().toString(36)}`;

afterAll(async () => {
  const groups = await prisma.tagGroup.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  await prisma.tagDefinition.deleteMany({ where: { groupId: { in: groups.map((g) => g.id) } } });
  await prisma.tagGroup.deleteMany({ where: { slug: { startsWith: RUN } } });
});

describe("getMarkTags", () => {
  it("gives the Judgment group's iconic and outtake, the same on every call", async () => {
    const a = await getMarkTags();
    const b = await getMarkTags();
    expect(a.iconic).toMatchObject({ slug: "iconic", group: { slug: "judgment" } });
    expect(a.outtake).toMatchObject({ slug: "outtake", group: { slug: "judgment" } });
    expect(b.iconic.id).toBe(a.iconic.id);
    expect(b.outtake.id).toBe(a.outtake.id);
  });

  it("prefers the Judgment tag over a same-named tag in another group", async () => {
    const other = await prisma.tagGroup.create({ data: { name: `${RUN} Other`, slug: `${RUN}-other` } });
    await prisma.tagDefinition.create({ data: { groupId: other.id, name: "iconic", slug: "iconic", nameNorm: "iconic" } });
    const { iconic } = await getMarkTags();
    expect(iconic.group.slug).toBe("judgment");
  });
});
