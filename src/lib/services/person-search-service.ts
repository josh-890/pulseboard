import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { PersonWithCommonAlias } from "@/lib/types";
import type {
  AttributeFilter,
  CategoricalFilter,
  FilterSpec,
  PresenceField,
  PresenceFilter,
  RangeFilter,
  RegionFilter,
  TextFilter,
} from "@/lib/types/filter-spec";
import { expandFamilyToValues, type ColorCategory } from "@/lib/constants/color-families";
import { expandRegionFilter } from "@/lib/constants/body-regions";

// ─── Field maps ──────────────────────────────────────────────────────────────

type CategoricalFieldDef = {
  // raw SQL fragment referencing the underlying column (use Prisma.sql)
  column: Prisma.Sql;
  // optional family column when the filter supports mode='family'
  familyColumn?: Prisma.Sql;
  colorCategory?: ColorCategory;
  caseInsensitive?: boolean;
};

const CATEGORICAL_FIELDS: Record<string, CategoricalFieldDef> = {
  status:           { column: Prisma.sql`p.status::text` },
  ethnicity:        { column: Prisma.sql`p.ethnicity`,            caseInsensitive: true },
  bodyType:         { column: Prisma.sql`p."bodyType"`,           caseInsensitive: true },
  naturalHairColor: { column: Prisma.sql`p."naturalHairColor"`,   caseInsensitive: true },
  hairColor:        { column: Prisma.sql`mv."currentHairColor"`,  familyColumn: Prisma.sql`mv."hairColorFamily"`, colorCategory: "hair", caseInsensitive: true },
  eyeColor:         { column: Prisma.sql`mv."eyeColor"`,          familyColumn: Prisma.sql`mv."eyeColorFamily"`,  colorCategory: "eye",  caseInsensitive: true },
  nationality:      { column: Prisma.sql`p.nationality`,          caseInsensitive: true },
  sexAtBirth:       { column: Prisma.sql`p."sexAtBirth"` },
  specialization:   { column: Prisma.sql`p.specialization`,       caseInsensitive: true },
};

type RangeFieldDef = {
  column: Prisma.Sql;
  // for "age", we derive from birthdate at query time
  derive?: "age";
};

const RANGE_FIELDS: Record<string, RangeFieldDef> = {
  height:  { column: Prisma.sql`p.height` },
  weight:  { column: Prisma.sql`mv."currentWeight"` },
  rating:  { column: Prisma.sql`p.rating` },
  pgrade:  { column: Prisma.sql`p.pgrade` },
  age:     { column: Prisma.sql`p.birthdate`, derive: "age" },
};

const PRESENCE_COLUMN: Record<PresenceField, Prisma.Sql> = {
  tattoo:       Prisma.sql`mv."hasTattoo"`,
  scar:         Prisma.sql`mv."hasScar"`,
  piercing:     Prisma.sql`mv."hasPiercing"`,
  modification: Prisma.sql`mv."hasModification"`,
  procedure:    Prisma.sql`mv."hasProcedure"`,
};

const REGION_COLUMN: Record<PresenceField, Prisma.Sql> = {
  tattoo:       Prisma.sql`mv."tattooRegions"`,
  scar:         Prisma.sql`mv."scarRegions"`,
  piercing:     Prisma.sql`mv."piercingRegions"`,
  modification: Prisma.sql`mv."modificationRegions"`,
  procedure:    Prisma.sql`mv."procedureRegions"`,
};

// ─── Where-clause builders ───────────────────────────────────────────────────

function buildCategoricalClauses(filters: CategoricalFilter[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    if (f.values.length === 0) continue;
    const def = CATEGORICAL_FIELDS[f.field];
    if (!def) continue;

    if (f.mode === "family" && def.familyColumn) {
      // Match against the precomputed family column
      out.push(Prisma.sql`${def.familyColumn} = ANY(${f.values})`);
    } else if (f.mode === "family" && def.colorCategory) {
      // Family column missing — expand families into all member values
      const expanded = f.values.flatMap((fam) => expandFamilyToValues(def.colorCategory!, fam));
      if (expanded.length > 0) {
        if (def.caseInsensitive) {
          out.push(Prisma.sql`lower(${def.column}) = ANY(${expanded.map((v) => v.toLowerCase())})`);
        } else {
          out.push(Prisma.sql`${def.column} = ANY(${expanded})`);
        }
      }
    } else {
      // Exact match
      if (def.caseInsensitive) {
        out.push(Prisma.sql`lower(${def.column}) = ANY(${f.values.map((v) => v.toLowerCase())})`);
      } else {
        out.push(Prisma.sql`${def.column} = ANY(${f.values})`);
      }
    }
  }
  return out;
}

function buildRangeClauses(filters: RangeFilter[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    const def = RANGE_FIELDS[f.field];
    if (!def) continue;

    if (def.derive === "age") {
      // age range → birthdate range (inverse)
      // age = (NOW - birthdate) / 1 year
      // age >= min → birthdate <= NOW - min years
      // age <= max → birthdate >= NOW - (max + 1) years
      if (f.max != null) {
        out.push(Prisma.sql`${def.column} >= (CURRENT_DATE - (${f.max + 1} * INTERVAL '1 year'))`);
      }
      if (f.min != null) {
        out.push(Prisma.sql`${def.column} <= (CURRENT_DATE - (${f.min} * INTERVAL '1 year'))`);
      }
    } else {
      const min = f.min != null && f.tolerance != null ? f.min - f.tolerance : f.min;
      const max = f.max != null && f.tolerance != null ? f.max + f.tolerance : f.max;
      if (min != null) out.push(Prisma.sql`${def.column} >= ${min}`);
      if (max != null) out.push(Prisma.sql`${def.column} <= ${max}`);
    }
  }
  return out;
}

function buildPresenceClauses(filters: PresenceFilter[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    if (f.state === "any") continue;
    const col = PRESENCE_COLUMN[f.field];
    if (!col) continue;
    if (f.state === "has") out.push(Prisma.sql`${col} = true`);
    else out.push(Prisma.sql`${col} = false`);
  }
  return out;
}

function buildRegionClauses(filters: RegionFilter[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    if (f.regions.length === 0) continue;
    const col = REGION_COLUMN[f.entity];
    if (!col) continue;
    const expanded = expandRegionFilter(f.regions);
    if (expanded.length === 0) continue;
    if (f.mode === "all") {
      // The mark/region array must contain every selected region (after hierarchical expansion)
      // For "all" we expect the user's exact selections to be present — don't over-match via hierarchy.
      out.push(Prisma.sql`${col} @> ${f.regions}`);
    } else {
      out.push(Prisma.sql`${col} && ${expanded}`);
    }
  }
  return out;
}

function buildTextClauses(filters: TextFilter[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    if (!f.query) continue;
    if (f.field === "name") {
      const pattern = `%${f.query}%`;
      out.push(Prisma.sql`(
        p."icgId" ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM "PersonAlias" pa
          WHERE pa."personId" = p.id AND pa.name ILIKE ${pattern}
        )
      )`);
    } else if (f.field === "bio") {
      const pattern = `%${f.query}%`;
      out.push(Prisma.sql`p.bio ILIKE ${pattern}`);
    } else if (f.field === "notes") {
      const pattern = `%${f.query}%`;
      out.push(Prisma.sql`p.notes ILIKE ${pattern}`);
    }
  }
  return out;
}

function buildAttributeClauses(filters: AttributeFilter[], slugById: Map<string, string>): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const f of filters) {
    if (f.values.length === 0) continue;
    const slug = slugById.get(f.definitionId);
    if (!slug) continue;
    // mv."currentAttributes" ->> '<slug>' IN (<values>)
    out.push(Prisma.sql`mv."currentAttributes" ->> ${slug} = ANY(${f.values})`);
  }
  return out;
}

async function loadAttributeSlugs(filters: AttributeFilter[]): Promise<Map<string, string>> {
  if (filters.length === 0) return new Map();
  const ids = filters.map((f) => f.definitionId);
  const defs = await prisma.physicalAttributeDefinition.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  return new Map(defs.map((d) => [d.id, d.slug]));
}

function combineWhere(clauses: Prisma.Sql[]): Prisma.Sql {
  if (clauses.length === 0) return Prisma.sql`TRUE`;
  return clauses.reduce((acc, c, i) => (i === 0 ? c : Prisma.sql`${acc} AND ${c}`));
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export type PersonSearchSort = "recent" | "oldest" | "name-asc" | "name-desc" | "rating-desc";

function buildOrderBy(sort: PersonSearchSort): Prisma.Sql {
  switch (sort) {
    case "oldest":       return Prisma.sql`p."createdAt" ASC, p.id ASC`;
    case "name-asc":     return Prisma.sql`COALESCE((SELECT name FROM "PersonAlias" WHERE "personId" = p.id AND "isCommon" = true LIMIT 1), p."icgId") ASC`;
    case "name-desc":    return Prisma.sql`COALESCE((SELECT name FROM "PersonAlias" WHERE "personId" = p.id AND "isCommon" = true LIMIT 1), p."icgId") DESC`;
    case "rating-desc":  return Prisma.sql`p.rating DESC NULLS LAST, p."createdAt" DESC`;
    case "recent":
    default:             return Prisma.sql`p."createdAt" DESC, p.id DESC`;
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type SearchResult = {
  items: PersonWithCommonAlias[];
  total: number;
  nextOffset: number | null;
};

export type SearchPagination = {
  offset?: number;
  limit?: number;
  sort?: PersonSearchSort;
};

type RawPersonRow = {
  id: string;
  icgId: string;
  status: import("@/generated/prisma/client").PersonStatus;
  rating: number | null;
  tags: string[];
  naturalHairColor: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  location: string | null;
  activeFrom: Date | null;
  activeFromPrecision: string;
  retiredAt: Date | null;
  retiredAtPrecision: string;
  specialization: string | null;
  createdAt: Date;
  birthdate: Date | null;
  birthdatePrecision: string;
  birthdateModifier: string;
  nationality: string | null;
  commonAlias: string | null;
  birthAlias: string | null;
  total_count: bigint;
};

async function buildWhereForSpec(spec: FilterSpec): Promise<Prisma.Sql> {
  const slugById = await loadAttributeSlugs(spec.attribute);
  const clauses: Prisma.Sql[] = [
    ...buildCategoricalClauses(spec.categorical),
    ...buildRangeClauses(spec.range),
    ...buildPresenceClauses(spec.presence),
    ...buildRegionClauses(spec.region),
    ...buildTextClauses(spec.text),
    ...buildAttributeClauses(spec.attribute, slugById),
  ];
  return combineWhere(clauses);
}

export async function searchPeople(
  spec: FilterSpec,
  pagination: SearchPagination = {},
): Promise<SearchResult> {
  const offset = pagination.offset ?? 0;
  const limit = pagination.limit ?? 50;
  const sort = pagination.sort ?? "recent";

  const where = await buildWhereForSpec(spec);
  const orderBy = buildOrderBy(sort);

  const rows = await prisma.$queryRaw<RawPersonRow[]>(Prisma.sql`
    SELECT
      p.id,
      p."icgId",
      p.status,
      p.rating,
      p.tags,
      p."naturalHairColor",
      p."bodyType",
      p.ethnicity,
      p.location,
      p."activeFrom",
      p."activeFromPrecision"::text AS "activeFromPrecision",
      p."retiredAt",
      p."retiredAtPrecision"::text AS "retiredAtPrecision",
      p.specialization,
      p."createdAt",
      p.birthdate,
      p."birthdatePrecision"::text AS "birthdatePrecision",
      p."birthdateModifier"::text  AS "birthdateModifier",
      p.nationality,
      (SELECT name FROM "PersonAlias" WHERE "personId" = p.id AND "isCommon" = true LIMIT 1) AS "commonAlias",
      (SELECT name FROM "PersonAlias" WHERE "personId" = p.id AND "isBirth"  = true LIMIT 1) AS "birthAlias",
      count(*) OVER () AS total_count
    FROM "Person" p
    LEFT JOIN mv_person_current_state mv ON mv."personId" = p.id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const items: PersonWithCommonAlias[] = rows.map((r) => ({
    id: r.id,
    icgId: r.icgId,
    status: r.status,
    rating: r.rating,
    tags: r.tags ?? [],
    naturalHairColor: r.naturalHairColor,
    bodyType: r.bodyType,
    ethnicity: r.ethnicity,
    location: r.location,
    activeFrom: r.activeFrom,
    activeFromPrecision: r.activeFromPrecision,
    retiredAt: r.retiredAt,
    retiredAtPrecision: r.retiredAtPrecision,
    specialization: r.specialization,
    createdAt: r.createdAt,
    commonAlias: r.commonAlias,
    birthdate: r.birthdate,
    birthdatePrecision: r.birthdatePrecision,
    birthdateModifier: r.birthdateModifier,
    nationality: r.nationality,
    birthAlias: r.birthAlias,
    completeness: 0,
  }));

  const nextOffset = offset + items.length < total ? offset + items.length : null;
  return { items, total, nextOffset };
}

// ─── Facet counts ────────────────────────────────────────────────────────────

export type FacetCounts = {
  categorical: Record<string, { value: string; count: number }[]>;
  presence: Record<string, { has: number; hasnt: number }>;
  attribute: Record<string, { value: string; count: number }[]>;
};

/**
 * Compute facet counts. Each facet's counts reflect the rest of the spec
 * applied (so users see how toggling a value would affect results).
 */
export async function getFacetCounts(spec: FilterSpec): Promise<FacetCounts> {
  const slugById = await loadAttributeSlugs(spec.attribute);

  const out: FacetCounts = {
    categorical: {},
    presence: {},
    attribute: {},
  };

  // Categorical facets — for each field, drop its own filter from the spec
  const requestedCategoricalFields = new Set([
    "status", "ethnicity", "bodyType", "naturalHairColor",
    "hairColor", "eyeColor", "nationality",
  ]);
  for (const field of requestedCategoricalFields) {
    const def = CATEGORICAL_FIELDS[field];
    if (!def) continue;
    const baseSpec: FilterSpec = {
      ...spec,
      categorical: spec.categorical.filter((c) => c.field !== field),
    };
    const where = await buildWhereForSpec(baseSpec);
    const rows = await prisma.$queryRaw<{ value: string | null; count: bigint }[]>(Prisma.sql`
      SELECT ${def.column} AS value, count(*)::bigint AS count
      FROM "Person" p
      LEFT JOIN mv_person_current_state mv ON mv."personId" = p.id
      WHERE ${where}
      GROUP BY ${def.column}
      ORDER BY count DESC, value ASC
    `);
    out.categorical[field] = rows
      .filter((r) => r.value != null && r.value !== "")
      .map((r) => ({ value: String(r.value), count: Number(r.count) }));
  }

  // Presence facets
  for (const field of ["tattoo", "scar", "piercing", "modification", "procedure"] as PresenceField[]) {
    const col = PRESENCE_COLUMN[field];
    const baseSpec: FilterSpec = {
      ...spec,
      presence: spec.presence.filter((p) => p.field !== field),
    };
    const where = await buildWhereForSpec(baseSpec);
    const rows = await prisma.$queryRaw<{ has: boolean; count: bigint }[]>(Prisma.sql`
      SELECT COALESCE(${col}, false) AS has, count(*)::bigint AS count
      FROM "Person" p
      LEFT JOIN mv_person_current_state mv ON mv."personId" = p.id
      WHERE ${where}
      GROUP BY COALESCE(${col}, false)
    `);
    let has = 0, hasnt = 0;
    for (const r of rows) {
      if (r.has) has = Number(r.count); else hasnt = Number(r.count);
    }
    out.presence[field] = { has, hasnt };
  }

  // Attribute facets — one query per requested attribute (its filter dropped from base spec)
  for (const f of spec.attribute) {
    const slug = slugById.get(f.definitionId);
    if (!slug) continue;
    const baseSpec: FilterSpec = {
      ...spec,
      attribute: spec.attribute.filter((a) => a.definitionId !== f.definitionId),
    };
    const where = await buildWhereForSpec(baseSpec);
    const rows = await prisma.$queryRaw<{ value: string | null; count: bigint }[]>(Prisma.sql`
      SELECT mv."currentAttributes" ->> ${slug} AS value, count(*)::bigint AS count
      FROM "Person" p
      LEFT JOIN mv_person_current_state mv ON mv."personId" = p.id
      WHERE ${where} AND mv."currentAttributes" ? ${slug}
      GROUP BY value
      ORDER BY count DESC, value ASC
    `);
    out.attribute[f.definitionId] = rows
      .filter((r) => r.value != null && r.value !== "")
      .map((r) => ({ value: String(r.value), count: Number(r.count) }));
  }

  return out;
}
