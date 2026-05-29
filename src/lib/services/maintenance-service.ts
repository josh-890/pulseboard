import { prisma } from "@/lib/db";

// Slice 16 follow-up audit destination / ADR-0008 principle 4.
//
// Periodic data-quality work: which persons are missing baseline data for
// attributes that matter? The tier model (TIER_1 = warning, TIER_2 = hint,
// NONE = not audited) lives on PhysicalAttributeDefinition.tier and lets the
// catalog admin decide what counts. The two Person-column identity fields
// (Birthday, Nationality) are tier 1 by design and audited via synthetic
// rows here — they stay as Person columns and are not migrated to the
// catalog.

export type AuditTier = "TIER_1" | "TIER_2";

// Synthetic Person-column "attributes" — they live as nullable columns on
// Person, not in the catalog, but appear in the audit as if they were
// tiered catalog attrs. Use the `_person.` prefix so they never collide
// with real catalog slugs.
const PERSON_COLUMN_AUDITS = [
  { slug: "_person.birthdate", name: "Birthday", groupName: "Person field" },
  { slug: "_person.nationality", name: "Nationality", groupName: "Person field" },
] as const;

export type BaselineGapByAttribute = {
  definitionId: string; // for Person columns: same as slug
  slug: string;
  name: string;
  groupName: string;
  tier: AuditTier;
  populatedCount: number;
  verifiedUnknownCount: number;
  missingCount: number;
  isPersonColumn: boolean;
};

export type BaselineGapByPerson = {
  personId: string;
  icgId: string;
  displayName: string;
  tier1MissingCount: number;
  tier2MissingCount: number;
  worstTier: AuditTier | null;
  // Items rendered as chips, tier-labelled so the UI can color them.
  // `isVerifiedUnknown` chips render in muted gray (not as a gap warning).
  missing: { slug: string; tier: AuditTier; isVerifiedUnknown: boolean }[];
};

export type BaselineGapTotals = {
  tier1PersonsWithGaps: number;
  tier2PersonsWithGaps: number;
  personsWithAnyGap: number;
  totalPersons: number;
  tier1AttrsTotal: number;
  tier2AttrsTotal: number;
};

/**
 * Per-attribute gap counts, scoped to attrs where `tier <> 'NONE'`. Also
 * injects synthetic rows for the Person-column audits (Birthday, Nationality).
 * Sort: tier ASC (TIER_1 first), then missingCount DESC.
 */
export async function getBaselineGapsByAttribute(): Promise<BaselineGapByAttribute[]> {
  // 3-bucket split inspects the JSONB value: "__UNKNOWN__" sentinel
  // counts as verified-unknown; any other value as populated; absent
  // key as missing.
  const catalogRows = await prisma.$queryRaw<
    {
      definitionId: string;
      slug: string;
      name: string;
      groupName: string;
      tier: AuditTier;
      populatedCount: bigint;
      verifiedUnknownCount: bigint;
      missingCount: bigint;
    }[]
  >`
    SELECT
      pad.id           AS "definitionId",
      pad.slug         AS slug,
      pad.name         AS name,
      pag.name         AS "groupName",
      pad.tier::text   AS tier,
      count(pcs.*) FILTER (
        WHERE pcs."baselineAttributes" ? pad.slug
          AND pcs."baselineAttributes" ->> pad.slug <> '__UNKNOWN__'
      ) AS "populatedCount",
      count(pcs.*) FILTER (
        WHERE pcs."baselineAttributes" ->> pad.slug = '__UNKNOWN__'
      ) AS "verifiedUnknownCount",
      count(pcs.*) FILTER (WHERE NOT (pcs."baselineAttributes" ? pad.slug)) AS "missingCount"
    FROM "PhysicalAttributeDefinition" pad
    JOIN "PhysicalAttributeGroup" pag ON pag.id = pad."groupId"
    CROSS JOIN "PersonCurrentState" pcs
    WHERE pad.tier <> 'NONE'
    GROUP BY pad.id, pad.slug, pad.name, pag.name, pad.tier
    ORDER BY pad.tier ASC, "missingCount" DESC, pad.name ASC
  `;

  const personColumnRows = await prisma.$queryRaw<
    {
      birthdateMissing: bigint;
      birthdateUnknown: bigint;
      nationalityMissing: bigint;
      nationalityUnknown: bigint;
      total: bigint;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE birthdate IS NULL AND NOT "birthdateUnknown")       AS "birthdateMissing",
      count(*) FILTER (WHERE "birthdateUnknown")                                 AS "birthdateUnknown",
      count(*) FILTER (WHERE nationality IS NULL AND NOT "nationalityUnknown")   AS "nationalityMissing",
      count(*) FILTER (WHERE "nationalityUnknown")                               AS "nationalityUnknown",
      count(*)                                                                   AS total
    FROM "Person"
  `;
  const pc =
    personColumnRows[0] ??
    {
      birthdateMissing: BigInt(0),
      birthdateUnknown: BigInt(0),
      nationalityMissing: BigInt(0),
      nationalityUnknown: BigInt(0),
      total: BigInt(0),
    };
  const totalPersons = Number(pc.total);
  const personColumnGaps: BaselineGapByAttribute[] = [
    {
      definitionId: PERSON_COLUMN_AUDITS[0].slug,
      slug: PERSON_COLUMN_AUDITS[0].slug,
      name: PERSON_COLUMN_AUDITS[0].name,
      groupName: PERSON_COLUMN_AUDITS[0].groupName,
      tier: "TIER_1",
      populatedCount:
        totalPersons - Number(pc.birthdateMissing) - Number(pc.birthdateUnknown),
      verifiedUnknownCount: Number(pc.birthdateUnknown),
      missingCount: Number(pc.birthdateMissing),
      isPersonColumn: true,
    },
    {
      definitionId: PERSON_COLUMN_AUDITS[1].slug,
      slug: PERSON_COLUMN_AUDITS[1].slug,
      name: PERSON_COLUMN_AUDITS[1].name,
      groupName: PERSON_COLUMN_AUDITS[1].groupName,
      tier: "TIER_1",
      populatedCount:
        totalPersons - Number(pc.nationalityMissing) - Number(pc.nationalityUnknown),
      verifiedUnknownCount: Number(pc.nationalityUnknown),
      missingCount: Number(pc.nationalityMissing),
      isPersonColumn: true,
    },
  ];

  const catalog: BaselineGapByAttribute[] = catalogRows.map((r) => ({
    definitionId: r.definitionId,
    slug: r.slug,
    name: r.name,
    groupName: r.groupName,
    tier: r.tier,
    populatedCount: Number(r.populatedCount),
    verifiedUnknownCount: Number(r.verifiedUnknownCount),
    missingCount: Number(r.missingCount),
    isPersonColumn: false,
  }));

  // Merge person-column rows into the catalog list, preserve overall sort
  // (TIER_1 first by tier, then by missing desc, then by name).
  const merged = [...personColumnGaps, ...catalog];
  merged.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "TIER_1" ? -1 : 1;
    if (a.missingCount !== b.missingCount) return b.missingCount - a.missingCount;
    return a.name.localeCompare(b.name);
  });
  return merged;
}

/**
 * Per-person gap list with tier-aware sub-counts. Persons with no gaps
 * (across both tiers) are omitted.
 */
export async function getBaselineGapsByPerson(): Promise<BaselineGapByPerson[]> {
  const rows = await prisma.$queryRaw<
    {
      personId: string;
      icgId: string;
      displayName: string;
      missingTier1: { slug: string }[];
      missingTier2: { slug: string }[];
      verifiedUnknownAttrs: { slug: string; tier: AuditTier }[];
      personColumnGaps: string[];
      personColumnUnknown: string[];
    }[]
  >`
    WITH tiered_attrs AS (
      SELECT slug, tier::text AS tier
      FROM "PhysicalAttributeDefinition"
      WHERE tier <> 'NONE'
    ),
    per_person_tier1 AS (
      SELECT pcs."personId",
        coalesce(jsonb_agg(jsonb_build_object('slug', ta.slug) ORDER BY ta.slug), '[]'::jsonb) AS missing
      FROM "PersonCurrentState" pcs
      LEFT JOIN tiered_attrs ta
        ON ta.tier = 'TIER_1' AND NOT (pcs."baselineAttributes" ? ta.slug)
      WHERE ta.slug IS NOT NULL
      GROUP BY pcs."personId"
    ),
    per_person_tier2 AS (
      SELECT pcs."personId",
        coalesce(jsonb_agg(jsonb_build_object('slug', ta.slug) ORDER BY ta.slug), '[]'::jsonb) AS missing
      FROM "PersonCurrentState" pcs
      LEFT JOIN tiered_attrs ta
        ON ta.tier = 'TIER_2' AND NOT (pcs."baselineAttributes" ? ta.slug)
      WHERE ta.slug IS NOT NULL
      GROUP BY pcs."personId"
    ),
    -- Verified-unknown catalog attrs per person: baseline value is the sentinel.
    per_person_unknown AS (
      SELECT pcs."personId",
        coalesce(
          jsonb_agg(jsonb_build_object('slug', ta.slug, 'tier', ta.tier) ORDER BY ta.slug),
          '[]'::jsonb
        ) AS unknowns
      FROM "PersonCurrentState" pcs
      LEFT JOIN tiered_attrs ta
        ON pcs."baselineAttributes" ->> ta.slug = '__UNKNOWN__'
      WHERE ta.slug IS NOT NULL
      GROUP BY pcs."personId"
    ),
    person_column_gaps AS (
      SELECT p.id AS "personId",
        coalesce(
          array_remove(
            ARRAY[
              -- "missing" only counts when both the value is null AND the
              -- user has not marked the field as verified-unknown.
              CASE WHEN p.birthdate IS NULL AND NOT p."birthdateUnknown" THEN '_person.birthdate' END,
              CASE WHEN p.nationality IS NULL AND NOT p."nationalityUnknown" THEN '_person.nationality' END
            ],
            NULL
          ),
          '{}'::text[]
        ) AS gaps,
        coalesce(
          array_remove(
            ARRAY[
              CASE WHEN p."birthdateUnknown" THEN '_person.birthdate' END,
              CASE WHEN p."nationalityUnknown" THEN '_person.nationality' END
            ],
            NULL
          ),
          '{}'::text[]
        ) AS unknowns
      FROM "Person" p
    )
    SELECT
      p.id                              AS "personId",
      p."icgId"                         AS "icgId",
      COALESCE(pa.name, p."icgId")      AS "displayName",
      COALESCE(t1.missing, '[]'::jsonb) AS "missingTier1",
      COALESCE(t2.missing, '[]'::jsonb) AS "missingTier2",
      COALESCE(pu.unknowns, '[]'::jsonb) AS "verifiedUnknownAttrs",
      pcg.gaps                          AS "personColumnGaps",
      pcg.unknowns                      AS "personColumnUnknown"
    FROM "Person" p
    LEFT JOIN "PersonAlias" pa ON pa."personId" = p.id AND pa."isCommon" = true
    LEFT JOIN per_person_tier1 t1 ON t1."personId" = p.id
    LEFT JOIN per_person_tier2 t2 ON t2."personId" = p.id
    LEFT JOIN per_person_unknown pu ON pu."personId" = p.id
    LEFT JOIN person_column_gaps pcg ON pcg."personId" = p.id
    ORDER BY "displayName" ASC
  `;

  type SlugRow = { slug: string };
  type SlugTierRow = { slug: string; tier: AuditTier };
  const results: BaselineGapByPerson[] = [];
  for (const r of rows) {
    // Person-column gaps merge into the tier-1 set since they're tier-1 by
    // design. The synthetic slug `_person.<field>` is what the UI chips use.
    const t1: { slug: string; tier: AuditTier; isVerifiedUnknown: boolean }[] = [
      ...(r.missingTier1 as SlugRow[]).map((m) => ({
        slug: m.slug,
        tier: "TIER_1" as const,
        isVerifiedUnknown: false,
      })),
      ...r.personColumnGaps.map((slug) => ({
        slug,
        tier: "TIER_1" as const,
        isVerifiedUnknown: false,
      })),
    ];
    const t2: { slug: string; tier: AuditTier; isVerifiedUnknown: boolean }[] =
      (r.missingTier2 as SlugRow[]).map((m) => ({
        slug: m.slug,
        tier: "TIER_2" as const,
        isVerifiedUnknown: false,
      }));
    const tier1MissingCount = t1.length;
    const tier2MissingCount = t2.length;
    if (tier1MissingCount === 0 && tier2MissingCount === 0) continue;

    // Verified-unknown chips appear on the row as muted context; they don't
    // count as gaps but show the user what's been triaged.
    const unknown: { slug: string; tier: AuditTier; isVerifiedUnknown: boolean }[] = [
      ...(r.verifiedUnknownAttrs as SlugTierRow[]).map((u) => ({
        slug: u.slug,
        tier: u.tier,
        isVerifiedUnknown: true,
      })),
      ...r.personColumnUnknown.map((slug) => ({
        slug,
        tier: "TIER_1" as const,
        isVerifiedUnknown: true,
      })),
    ];

    const worstTier: AuditTier | null =
      tier1MissingCount > 0 ? "TIER_1" : tier2MissingCount > 0 ? "TIER_2" : null;
    results.push({
      personId: r.personId,
      icgId: r.icgId,
      displayName: r.displayName,
      tier1MissingCount,
      tier2MissingCount,
      worstTier,
      missing: [...t1, ...t2, ...unknown],
    });
  }
  // Sort: worst tier first (T1 before T2), then by missing-count descending,
  // then by name.
  results.sort((a, b) => {
    const aWorst = a.worstTier === "TIER_1" ? 0 : 1;
    const bWorst = b.worstTier === "TIER_1" ? 0 : 1;
    if (aWorst !== bWorst) return aWorst - bWorst;
    const aTotal = a.tier1MissingCount + a.tier2MissingCount;
    const bTotal = b.tier1MissingCount + b.tier2MissingCount;
    if (aTotal !== bTotal) return bTotal - aTotal;
    return a.displayName.localeCompare(b.displayName);
  });
  return results;
}

/**
 * Top-line totals for the dashboard tile + page header.
 * `tier1PersonsWithGaps` is the audit-warning count (drives the tile);
 * `tier2PersonsWithGaps` is hint-level; both can be zero independently.
 */
export async function getBaselineGapTotals(): Promise<BaselineGapTotals> {
  const rows = await prisma.$queryRaw<
    {
      tier1PersonsWithGaps: bigint;
      tier2PersonsWithGaps: bigint;
      personsWithAnyGap: bigint;
      totalPersons: bigint;
      tier1AttrsTotal: bigint;
      tier2AttrsTotal: bigint;
    }[]
  >`
    WITH tiered_attrs AS (
      SELECT slug, tier::text AS tier
      FROM "PhysicalAttributeDefinition"
      WHERE tier <> 'NONE'
    ),
    person_gap_flags AS (
      -- "Gap" excludes verified-unknown: the JSONB key must be absent for the
      -- attribute to count as missing (the sentinel "__UNKNOWN__" lives in
      -- the value but the key IS present, so this clause naturally excludes
      -- it). Tier-2 same.
      SELECT
        pcs."personId",
        bool_or(ta.tier = 'TIER_1' AND NOT (pcs."baselineAttributes" ? ta.slug))
          AS has_tier1_attr_gap,
        bool_or(ta.tier = 'TIER_2' AND NOT (pcs."baselineAttributes" ? ta.slug))
          AS has_tier2_gap
      FROM "PersonCurrentState" pcs
      LEFT JOIN tiered_attrs ta ON true
      GROUP BY pcs."personId"
    ),
    person_with_column_gap AS (
      SELECT
        p.id AS "personId",
        (
          (p.birthdate IS NULL AND NOT p."birthdateUnknown")
          OR (p.nationality IS NULL AND NOT p."nationalityUnknown")
        ) AS has_person_column_gap
      FROM "Person" p
    ),
    combined AS (
      SELECT
        pgf."personId",
        COALESCE(pgf.has_tier1_attr_gap, false) OR COALESCE(pwcg.has_person_column_gap, false)
          AS has_tier1_gap,
        COALESCE(pgf.has_tier2_gap, false) AS has_tier2_gap
      FROM person_gap_flags pgf
      LEFT JOIN person_with_column_gap pwcg ON pwcg."personId" = pgf."personId"
    )
    SELECT
      (SELECT count(*)::bigint FROM combined WHERE has_tier1_gap)                            AS "tier1PersonsWithGaps",
      (SELECT count(*)::bigint FROM combined WHERE has_tier2_gap)                            AS "tier2PersonsWithGaps",
      (SELECT count(*)::bigint FROM combined WHERE has_tier1_gap OR has_tier2_gap)           AS "personsWithAnyGap",
      (SELECT count(*)::bigint FROM "PersonCurrentState")                                    AS "totalPersons",
      (SELECT count(*)::bigint FROM tiered_attrs WHERE tier = 'TIER_1')                      AS "tier1AttrsTotal",
      (SELECT count(*)::bigint FROM tiered_attrs WHERE tier = 'TIER_2')                      AS "tier2AttrsTotal"
  `;
  const r = rows[0];
  return {
    tier1PersonsWithGaps: r ? Number(r.tier1PersonsWithGaps) : 0,
    tier2PersonsWithGaps: r ? Number(r.tier2PersonsWithGaps) : 0,
    personsWithAnyGap: r ? Number(r.personsWithAnyGap) : 0,
    totalPersons: r ? Number(r.totalPersons) : 0,
    // +2 = the two Person-column tier-1 fields (Birthday, Nationality).
    tier1AttrsTotal: (r ? Number(r.tier1AttrsTotal) : 0) + PERSON_COLUMN_AUDITS.length,
    tier2AttrsTotal: r ? Number(r.tier2AttrsTotal) : 0,
  };
}
