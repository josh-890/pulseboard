import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteComposerPreset, getComposerPresets, saveComposerPreset } from "@/lib/services/composer-preset-service";

// Composer presets (ADR-0042, S6) against the DEV database; names carry RUN.

const RUN = `cpr${Date.now().toString(36)}`;

afterAll(async () => {
  await prisma.composerPreset.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("composer presets", () => {
  it("saves, replaces by name, drops deleted tags on read, deletes", async () => {
    const [a, b] = await prisma.tagDefinition.findMany({ take: 2, select: { id: true }, orderBy: { id: "asc" } });
    await expect(saveComposerPreset(`${RUN} empty`, { adds: [], removes: [] })).rejects.toThrow(/empty/);
    await expect(saveComposerPreset("  ", { adds: [a.id], removes: [] })).rejects.toThrow(/name/);
    const p = await saveComposerPreset(`${RUN} base`, { adds: [a.id, a.id], removes: [a.id, b.id] });
    expect(p).toMatchObject({ adds: [a.id], removes: [b.id] }); // deduped; never add and remove the same tag
    await saveComposerPreset(`${RUN} base`, { adds: [b.id], removes: [] });
    await prisma.composerPreset.update({ where: { id: p.id }, data: { adds: [b.id, "gone-tag-id"] } });
    const mine = (await getComposerPresets()).filter((x) => x.name.startsWith(RUN));
    expect(mine).toEqual([{ id: p.id, name: `${RUN} base`, adds: [b.id], removes: [] }]);
    await deleteComposerPreset(p.id);
    expect((await getComposerPresets()).some((x) => x.id === p.id)).toBe(false);
  });
});
