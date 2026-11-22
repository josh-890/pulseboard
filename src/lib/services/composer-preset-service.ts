import { prisma } from "@/lib/db";
import type { Composition } from "@/lib/composer";

// Composer presets (ADR-0042, S6): named compositions — tags to add and to
// remove — loaded onto a photo, used as a brush, or applied to a selection.

export type ComposerPreset = { id: string; name: string } & Composition;

/** All presets, in order; tags deleted since drop out */
export async function getComposerPresets(): Promise<ComposerPreset[]> {
  const [rows, tags] = await Promise.all([
    prisma.composerPreset.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.tagDefinition.findMany({ select: { id: true } }),
  ]);
  const known = new Set(tags.map((t) => t.id));
  return rows.map((r) => ({ id: r.id, name: r.name, adds: r.adds.filter((t) => known.has(t)), removes: r.removes.filter((t) => known.has(t)) }));
}

/** Save a composition under a name — a name already used is replaced */
export async function saveComposerPreset(name: string, comp: Composition): Promise<ComposerPreset> {
  const n = name.trim();
  if (!n) throw new Error("Give the preset a name");
  if (comp.adds.length + comp.removes.length === 0) throw new Error("The preset is empty — pick tags first");
  const adds = [...new Set(comp.adds)];
  const removes = [...new Set(comp.removes)].filter((t) => !adds.includes(t));
  const order = await prisma.composerPreset.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.composerPreset.upsert({
    where: { name: n },
    create: { name: n, adds, removes, sortOrder: (order._max.sortOrder ?? 0) + 1 },
    update: { adds, removes },
  });
  return { id: row.id, name: row.name, adds: row.adds, removes: row.removes };
}

export async function deleteComposerPreset(id: string): Promise<void> {
  await prisma.composerPreset.delete({ where: { id } });
}
