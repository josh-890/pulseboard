import { prisma } from "@/lib/db";

// The Detail tier's bridge to the person archive (ADR-0043): the photo is tagged
// with a region; when the person is known, her body marks and modifications in
// that region are offered, and a click hangs the photo into her archive through
// the existing detail-assign route (reference-session copy, entity link).

export type ComposerBodyFeature = {
  kind: "mark" | "modification";
  id: string;
  /** "tattoo", "piercing" … */
  type: string;
  /** What the person archive calls it: motif / description / type, with the region */
  label: string;
  /** The detail category the photo goes into */
  categoryId: string;
  categoryName: string;
};

const MARK_CATEGORY: Record<string, string> = { tattoo: "tattoos", scar: "scars", burn: "scars" };
const MOD_CATEGORY: Record<string, string> = { piercing: "piercings", branding: "brandings", scarification: "brandings", implant: "implants" };

/** A region of the catalogue covers its sub-regions (face covers face.lips) and is covered by its parent */
export function regionsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

/** Catalogue region ids of the Region tags given (`tag_definition.regionCatalogId`, comma separated) */
export async function regionIdsOfTags(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const tags = await prisma.tagDefinition.findMany({ where: { id: { in: tagIds } }, select: { regionCatalogId: true } });
  return [...new Set(tags.flatMap((t) => (t.regionCatalogId ?? "").split(",").map((x) => x.trim()).filter(Boolean)))];
}

export async function getBodyFeaturesInRegions(personId: string, regionIds: string[]): Promise<ComposerBodyFeature[]> {
  if (regionIds.length === 0) return [];
  const [marks, mods, categories] = await Promise.all([
    prisma.bodyMark.findMany({
      where: { personId, status: { not: "removed" } },
      select: { id: true, type: true, bodyRegion: true, bodyRegions: true, motif: true, description: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.bodyModification.findMany({
      where: { personId, status: { not: "removed" } },
      select: { id: true, type: true, bodyRegion: true, bodyRegions: true, description: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mediaCategory.findMany({ where: { entityModel: { in: ["BodyMark", "BodyModification"] } }, select: { id: true, slug: true, name: true } }),
  ]);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const inRegion = (r: { bodyRegion: string; bodyRegions: string[] }) =>
    [r.bodyRegion, ...r.bodyRegions].filter(Boolean).some((x) => regionIds.some((s) => regionsOverlap(x, s)));
  const out: ComposerBodyFeature[] = [];
  for (const m of marks) {
    const cat = bySlug.get(MARK_CATEGORY[m.type] ?? "birthmarks");
    if (!cat || !inRegion(m)) continue;
    out.push({ kind: "mark", id: m.id, type: m.type, label: [m.motif || m.description || m.type, m.bodyRegion].filter(Boolean).join(" · "), categoryId: cat.id, categoryName: cat.name });
  }
  for (const m of mods) {
    const slug = MOD_CATEGORY[m.type];
    const cat = slug ? bySlug.get(slug) : undefined;
    if (!cat || !inRegion(m)) continue;
    out.push({ kind: "modification", id: m.id, type: m.type, label: [m.description || m.type, m.bodyRegion].filter(Boolean).join(" · "), categoryId: cat.id, categoryName: cat.name });
  }
  return out;
}
