import { prisma } from "@/lib/db";
import {
  inferForCategory,
  type ColorCategory,
} from "@/lib/constants/color-catalog";

export type ColorCatalogEntryRecord = {
  category: ColorCategory;
  valueNorm: string;
  display: string;
  hue: string;
  shade: string | null;
  shadeRank: number | null;
  sortOrder: number;
  needsReview: boolean;
  pickable: boolean;
  source: string;
  createdAt: Date;
};

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

function titleCase(v: string): string {
  return v
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function toRecord(
  row: Awaited<ReturnType<typeof prisma.colorCatalog.findFirst>>,
): ColorCatalogEntryRecord | null {
  if (!row) return null;
  return {
    category: row.category as ColorCategory,
    valueNorm: row.valueNorm,
    display: row.display,
    hue: row.hue,
    shade: row.shade,
    shadeRank: row.shadeRank,
    sortOrder: row.sortOrder,
    needsReview: row.needsReview,
    pickable: row.pickable,
    source: row.source,
    createdAt: row.createdAt,
  };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export type ListColorCatalogOptions = {
  // When true (default), returns only entries with `pickable = true`. The
  // picker uses this; the catalog manager passes `false` to see every row.
  pickableOnly?: boolean;
};

export async function listColorCatalog(
  category: ColorCategory,
  opts: ListColorCatalogOptions = {},
): Promise<ColorCatalogEntryRecord[]> {
  const pickableOnly = opts.pickableOnly ?? true;
  const rows = await prisma.colorCatalog.findMany({
    where: { category, ...(pickableOnly ? { pickable: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { display: "asc" }],
  });
  return rows.map((r) => toRecord(r)!);
}

export async function getColorCatalogEntry(
  category: ColorCategory,
  valueNorm: string,
): Promise<ColorCatalogEntryRecord | null> {
  const row = await prisma.colorCatalog.findUnique({
    where: { category_valueNorm: { category, valueNorm: normalize(valueNorm) } },
  });
  return toRecord(row);
}

// ─── Create / Update / Delete ───────────────────────────────────────────────

export type ColorCatalogInput = {
  value: string;
  display?: string;
  hue: string;
  shade?: string | null;
  shadeRank?: number | null;
  sortOrder?: number;
};

export async function createColorCatalogEntry(
  category: ColorCategory,
  input: ColorCatalogInput,
): Promise<ColorCatalogEntryRecord> {
  const valueNorm = normalize(input.value);
  if (!valueNorm) throw new Error("Value is required");
  if (!input.hue) throw new Error("Hue is required");

  const row = await prisma.colorCatalog.create({
    data: {
      category,
      valueNorm,
      display: input.display?.trim() || titleCase(input.value),
      hue: input.hue,
      shade: input.shade ?? null,
      shadeRank: input.shadeRank ?? null,
      sortOrder: input.sortOrder ?? 0,
      needsReview: false,
      source: "manual",
    },
  });
  return toRecord(row)!;
}

export type ColorCatalogUpdate = {
  display?: string;
  hue?: string;
  shade?: string | null;
  shadeRank?: number | null;
  sortOrder?: number;
  needsReview?: boolean;
  pickable?: boolean;
};

export async function updateColorCatalogEntry(
  category: ColorCategory,
  valueNorm: string,
  patch: ColorCatalogUpdate,
): Promise<ColorCatalogEntryRecord> {
  const row = await prisma.colorCatalog.update({
    where: { category_valueNorm: { category, valueNorm: normalize(valueNorm) } },
    data: {
      ...(patch.display !== undefined ? { display: patch.display } : {}),
      ...(patch.hue !== undefined ? { hue: patch.hue } : {}),
      ...(patch.shade !== undefined ? { shade: patch.shade } : {}),
      ...(patch.shadeRank !== undefined ? { shadeRank: patch.shadeRank } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.pickable !== undefined ? { pickable: patch.pickable } : {}),
      // Any edit by a human clears the needs_review flag unless explicitly kept.
      // A pickable toggle is curation, not a content edit, so leave needsReview
      // alone in that case.
      ...(patch.pickable !== undefined && Object.keys(patch).length === 1
        ? {}
        : { needsReview: patch.needsReview ?? false }),
    },
  });
  return toRecord(row)!;
}

export async function deleteColorCatalogEntry(
  category: ColorCategory,
  valueNorm: string,
): Promise<void> {
  const norm = normalize(valueNorm);
  // Refuse deletion if any person record still references this value (by name).
  // All three categories now live in ScalarDelta (by attribute slug). The
  // legacy Person.naturalHairColor + Person.eyeColor columns were dropped
  // — every read goes through the baseline ScalarDelta rows.
  if (category === "hair") {
    const inUse = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n
       FROM "ScalarDelta" sd
       JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
       WHERE pad.slug = 'hair_color' AND lower(trim(coalesce(sd.value, ''))) = $1`,
      norm,
    );
    if (Number(inUse[0].n) > 0) {
      throw new Error("Cannot delete — this hair color is in use on existing person records");
    }
  } else if (category === "eye") {
    const inUse = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n
       FROM "ScalarDelta" sd
       JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
       WHERE pad.slug = 'eye-color' AND lower(trim(coalesce(sd.value, ''))) = $1`,
      norm,
    );
    if (Number(inUse[0].n) > 0) {
      throw new Error("Cannot delete — this eye color is in use on existing person records");
    }
  } else if (category === "skin") {
    const inUse = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n
       FROM "ScalarDelta" sd
       JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
       WHERE pad.slug = 'skin_tone' AND lower(trim(coalesce(sd.value, ''))) = $1`,
      norm,
    );
    if (Number(inUse[0].n) > 0) {
      throw new Error("Cannot delete — this skin tone is in use on existing person records");
    }
  }

  await prisma.colorCatalog.delete({
    where: { category_valueNorm: { category, valueNorm: norm } },
  });
}

// ─── ensureCatalogEntry: the import / API auto-add helper ───────────────────
//
// Idempotent. If the value is already in the catalog, do nothing. Otherwise
// insert it with heuristic-derived hue/shade + needs_review = true so the
// admin can refine later in the Settings UI. Used by every non-UI write path
// (importers, scrapers, staging-set promotion, server actions that accept a
// raw string).
//
// Never throws on bad input — empty / null values are silently ignored so
// they don't break the calling import workflow.

export async function ensureCatalogEntry(
  category: ColorCategory,
  value: string | null | undefined,
): Promise<void> {
  if (!value) return;
  const valueNorm = normalize(value);
  if (!valueNorm) return;

  const existing = await prisma.colorCatalog.findUnique({
    where: { category_valueNorm: { category, valueNorm } },
  });
  if (existing) return;

  const inferred = inferForCategory(category, value);
  try {
    await prisma.colorCatalog.create({
      data: {
        category,
        valueNorm,
        display: titleCase(value),
        hue: inferred.hue,
        shade: inferred.shade,
        shadeRank: inferred.shadeRank,
        sortOrder: 999, // auto-added entries sink to the bottom until reviewed
        needsReview: true,
        source: "import_auto",
      },
    });
  } catch (e) {
    // Race condition with another concurrent ensureCatalogEntry — safe to ignore
    if (e instanceof Error && e.message.includes("Unique")) return;
    throw e;
  }
}
