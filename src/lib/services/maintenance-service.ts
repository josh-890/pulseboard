import { prisma } from "@/lib/db";

// Slice 16 Step 4 audit destination / ADR-0008 principle 4.
//
// Periodic data-quality work: are all persons fully populated for the
// meaningful baseline attrs? Mixing the audit into the daily people-search
// sidebar buried it under filter noise (see the design conversation that
// produced the dedicated /maintenance destination). These queries back the
// page; they auto-scope to "active" attributes — those with at least one
// populated baseline somewhere in the dataset — so the audit doesn't
// surface noise for catalog entries nobody fills.

export type BaselineGapByAttribute = {
  definitionId: string;
  slug: string;
  name: string;
  groupName: string;
  populatedCount: number;
  missingCount: number;
};

export type BaselineGapByPerson = {
  personId: string;
  icgId: string;
  displayName: string;
  missingCount: number;
  missingSlugs: string[];
};

export type BaselineGapTotals = {
  personsWithGaps: number;
  totalPersons: number;
  activeAttrsTotal: number;
};

/**
 * Per-attribute gap counts, scoped to attrs that have ≥1 populated baseline
 * value across the dataset. Sorted by missing-count descending.
 */
export async function getBaselineGapsByAttribute(): Promise<BaselineGapByAttribute[]> {
  const rows = await prisma.$queryRaw<
    {
      definitionId: string;
      slug: string;
      name: string;
      groupName: string;
      populatedCount: bigint;
      missingCount: bigint;
    }[]
  >`
    SELECT
      pad.id           AS "definitionId",
      pad.slug         AS slug,
      pad.name         AS name,
      pag.name         AS "groupName",
      count(pcs.*) FILTER (WHERE pcs."baselineAttributes" ? pad.slug)       AS "populatedCount",
      count(pcs.*) FILTER (WHERE NOT (pcs."baselineAttributes" ? pad.slug)) AS "missingCount"
    FROM "PhysicalAttributeDefinition" pad
    JOIN "PhysicalAttributeGroup" pag ON pag.id = pad."groupId"
    CROSS JOIN "PersonCurrentState" pcs
    GROUP BY pad.id, pad.slug, pad.name, pag.name
    HAVING count(pcs.*) FILTER (WHERE pcs."baselineAttributes" ? pad.slug) > 0
    ORDER BY "missingCount" DESC, "name" ASC
  `;
  return rows.map((r) => ({
    definitionId: r.definitionId,
    slug: r.slug,
    name: r.name,
    groupName: r.groupName,
    populatedCount: Number(r.populatedCount),
    missingCount: Number(r.missingCount),
  }));
}

/**
 * Per-person gap list. Only includes persons missing at least one active
 * attr. `missingSlugs` is the explicit list so the UI can show what's gone.
 */
export async function getBaselineGapsByPerson(): Promise<BaselineGapByPerson[]> {
  const rows = await prisma.$queryRaw<
    {
      personId: string;
      icgId: string;
      displayName: string;
      missingCount: bigint;
      missingSlugs: string[];
    }[]
  >`
    WITH active_slugs AS (
      SELECT DISTINCT key AS slug
      FROM "PersonCurrentState", jsonb_object_keys("baselineAttributes") AS key
    ),
    per_person_missing AS (
      SELECT
        pcs."personId",
        array_agg(act.slug ORDER BY act.slug) AS "missingSlugs"
      FROM "PersonCurrentState" pcs
      CROSS JOIN active_slugs act
      WHERE NOT (pcs."baselineAttributes" ? act.slug)
      GROUP BY pcs."personId"
    )
    SELECT
      ppm."personId"   AS "personId",
      p."icgId"        AS "icgId",
      COALESCE(pa.name, p."icgId") AS "displayName",
      array_length(ppm."missingSlugs", 1)::bigint AS "missingCount",
      ppm."missingSlugs"
    FROM per_person_missing ppm
    JOIN "Person" p ON p.id = ppm."personId"
    LEFT JOIN "PersonAlias" pa
      ON pa."personId" = p.id AND pa."isCommon" = true
    ORDER BY "missingCount" DESC, "displayName" ASC
  `;
  return rows.map((r) => ({
    personId: r.personId,
    icgId: r.icgId,
    displayName: r.displayName,
    missingCount: Number(r.missingCount),
    missingSlugs: r.missingSlugs,
  }));
}

/**
 * Top-line totals for the dashboard tile + page header.
 */
export async function getBaselineGapTotals(): Promise<BaselineGapTotals> {
  const rows = await prisma.$queryRaw<
    {
      personsWithGaps: bigint;
      totalPersons: bigint;
      activeAttrsTotal: bigint;
    }[]
  >`
    WITH active_slugs AS (
      SELECT DISTINCT key AS slug
      FROM "PersonCurrentState", jsonb_object_keys("baselineAttributes") AS key
    ),
    per_person_missing AS (
      SELECT pcs."personId"
      FROM "PersonCurrentState" pcs
      CROSS JOIN active_slugs act
      WHERE NOT (pcs."baselineAttributes" ? act.slug)
      GROUP BY pcs."personId"
    )
    SELECT
      (SELECT count(*)::bigint FROM per_person_missing)         AS "personsWithGaps",
      (SELECT count(*)::bigint FROM "PersonCurrentState")       AS "totalPersons",
      (SELECT count(*)::bigint FROM active_slugs)               AS "activeAttrsTotal"
  `;
  const r = rows[0];
  return {
    personsWithGaps: r ? Number(r.personsWithGaps) : 0,
    totalPersons: r ? Number(r.totalPersons) : 0,
    activeAttrsTotal: r ? Number(r.activeAttrsTotal) : 0,
  };
}
