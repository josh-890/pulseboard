-- Drop PersonCurrentState presence-boolean cache columns:
--   hasTattoo, hasScar, hasPiercing, hasModification, hasProcedure.
--
-- Background:
-- Phase G Slice 15 (2026-05-25) added PersonCurrentState.presentBodyFeatureTypes
-- (text[], GIN-indexed) — populated by the SQL fold from the union of body-mark
-- types and body-modification types per person. That column carries strictly
-- more information than the five boolean flags (it names which types are
-- present, not just whether each one is). The flags have been redundant since.
--
-- Code changes shipping with this migration:
--   - src/lib/services/person-search-service.ts: PRESENCE_COLUMN map is
--     rewritten. tattoo/scar/piercing are now `'tattoo' = ANY(presentBodyFeatureTypes)`
--     style array-membership checks; `modification` becomes an overlap
--     against the non-piercing modification types
--     (stretching, branding, scarification, implant, teeth, jewelry, other);
--     `procedure` falls back to `EXISTS (SELECT 1 FROM CosmeticProcedure
--     cp WHERE cp."personId" = p.id)` since CosmeticProcedure is not folded
--     into presentBodyFeatureTypes (the CosmeticProcedure table itself
--     remains until Slice 17 per ADR-0007).
--   - The fold function `app_recompute_person_current_state` (last
--     redefined in 20260529020000_verified_unknown) is reissued below
--     without the boolean CTEs / INSERT / EXCLUDED assignments.
--
-- Region arrays (tattooRegions, scarRegions, piercingRegions,
-- modificationRegions, procedureRegions) are NOT touched — they back the
-- region-filter UI (e.g. "tattoos on the arm") which the type-presence
-- array doesn't replace.

CREATE OR REPLACE FUNCTION public.app_recompute_person_current_state(p_id text DEFAULT NULL::text)
RETURNS void
LANGUAGE sql
AS $function$
  WITH delta_ranked AS (
    SELECT
      e."personId",
      e."isBaseline",
      pad.slug,
      sd.value,
      sd.cause,
      row_number() OVER (
        PARTITION BY e."personId", sd."attributeDefinitionId"
        ORDER BY e."isBaseline" ASC,
                 COALESCE(sd.date, e.date) DESC NULLS LAST,
                 sd."createdAt" DESC,
                 sd.id DESC
      ) AS rn
    FROM "ScalarDelta" sd
    JOIN "Era" e ON e.id = sd."eraId"
    JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
    WHERE (p_id IS NULL OR e."personId" = p_id) AND trim(sd.value) <> ''
  ),
  delta_latest AS (
    SELECT "personId", slug, value, cause FROM delta_ranked WHERE rn = 1
  ),
  -- Baseline-only: verified-unknown deltas are included and the value
  -- replaced with the sentinel "__UNKNOWN__". Real-value deltas keep
  -- their value. trim()<>'' filter applies only to the non-verified path.
  baseline_latest AS (
    SELECT DISTINCT ON (e."personId", pad.slug)
      e."personId",
      pad.slug,
      CASE WHEN sd."isVerifiedUnknown" THEN '__UNKNOWN__' ELSE sd.value END AS value
    FROM "ScalarDelta" sd
    JOIN "Era" e ON e.id = sd."eraId"
    JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
    WHERE e."isBaseline" = true
      AND (sd."isVerifiedUnknown" OR trim(sd.value) <> '')
      AND (p_id IS NULL OR e."personId" = p_id)
    ORDER BY e."personId", pad.slug, sd."createdAt" DESC, sd.id DESC
  ),
  baseline_attr_agg AS (
    SELECT "personId", jsonb_object_agg(slug, value) AS "baselineAttributes"
    FROM baseline_latest GROUP BY "personId"
  ),
  surgical_history AS (
    SELECT DISTINCT "personId", slug
    FROM delta_ranked
    WHERE cause = 'SURGICAL'
  ),
  status_per_attr AS (
    SELECT
      dl."personId",
      dl.slug,
      CASE
        WHEN dl.cause = 'SURGICAL' THEN 'ENHANCED'
        WHEN EXISTS (SELECT 1 FROM surgical_history sh
                     WHERE sh."personId" = dl."personId" AND sh.slug = dl.slug)
          THEN 'RESTORED'
        ELSE 'NATURAL'
      END AS status
    FROM delta_latest dl
  ),
  attribute_statuses AS (
    SELECT "personId", jsonb_object_agg(slug, status) AS "attributeStatuses"
    FROM status_per_attr
    WHERE status <> 'NATURAL'
    GROUP BY "personId"
  ),
  scalar_folded AS (
    SELECT
      "personId",
      max(value) FILTER (WHERE slug = 'hair_color') AS "currentHairColor",
      max(value) FILTER (WHERE slug = 'weight')     AS weight_text,
      max(value) FILTER (WHERE slug = 'build')      AS "currentBuild",
      max(value) FILTER (WHERE slug = 'eye-color')  AS "eyeColor"
    FROM delta_latest GROUP BY "personId"
  ),
  attr_agg AS (
    SELECT "personId", jsonb_object_agg(slug, value) AS "currentAttributes"
    FROM delta_latest
    WHERE slug NOT IN ('hair_color', 'weight', 'build')
    GROUP BY "personId"
  ),
  bm_unnest AS (
    SELECT bm."personId", bm.type::text AS mark_type, region
    FROM "BodyMark" bm
    CROSS JOIN LATERAL unnest(bm."bodyRegions") AS region
    WHERE bm.status = 'present' AND (p_id IS NULL OR bm."personId" = p_id)
  ),
  body_mark_agg AS (
    SELECT
      "personId",
      coalesce(array_agg(DISTINCT region) FILTER (WHERE mark_type = 'tattoo'), '{}'::text[]) AS "tattooRegions",
      coalesce(array_agg(DISTINCT region) FILTER (WHERE mark_type = 'scar'),   '{}'::text[]) AS "scarRegions"
    FROM bm_unnest GROUP BY "personId"
  ),
  bmod_unnest AS (
    SELECT bmod."personId", bmod.type::text AS mod_type, region
    FROM "BodyModification" bmod
    CROSS JOIN LATERAL unnest(bmod."bodyRegions") AS region
    WHERE bmod.status = 'present' AND (p_id IS NULL OR bmod."personId" = p_id)
  ),
  body_mod_agg AS (
    SELECT
      "personId",
      coalesce(array_agg(DISTINCT region) FILTER (WHERE mod_type = 'piercing'),  '{}'::text[]) AS "piercingRegions",
      coalesce(array_agg(DISTINCT region) FILTER (WHERE mod_type <> 'piercing'), '{}'::text[]) AS "modificationRegions"
    FROM bmod_unnest GROUP BY "personId"
  ),
  cp_unnest AS (
    SELECT cp."personId", region
    FROM "CosmeticProcedure" cp
    CROSS JOIN LATERAL unnest(cp."bodyRegions") AS region
    WHERE p_id IS NULL OR cp."personId" = p_id
  ),
  procedure_agg AS (
    SELECT "personId",
      coalesce(array_agg(DISTINCT region), '{}'::text[]) AS "procedureRegions"
    FROM cp_unnest GROUP BY "personId"
  ),
  present_types AS (
    SELECT DISTINCT "personId", mark_type AS feature_type FROM bm_unnest
    UNION
    SELECT DISTINCT "personId", mod_type  AS feature_type FROM bmod_unnest
  ),
  present_types_agg AS (
    SELECT "personId", array_agg(DISTINCT feature_type ORDER BY feature_type) AS "presentBodyFeatureTypes"
    FROM present_types GROUP BY "personId"
  )
  INSERT INTO "PersonCurrentState" (
    "personId", "eyeColor", "currentHairColor", "currentWeight", "currentBuild",
    "hairHue", "hairLightness", "hairLightnessRank",
    "eyeHue", "eyeLightness", "eyeLightnessRank",
    "skinTone", "skinToneRank", "skinUndertone",
    "currentAttributes", "attributeStatuses", "baselineAttributes",
    "tattooRegions", "scarRegions", "piercingRegions", "modificationRegions", "procedureRegions",
    "presentBodyFeatureTypes",
    "updatedAt"
  )
  SELECT
    p.id,
    sf."eyeColor",
    sf."currentHairColor",
    NULLIF(sf.weight_text, '')::double precision,
    sf."currentBuild",
    lookup_hair_hue(sf."currentHairColor"),
    lookup_hair_shade(sf."currentHairColor"),
    lookup_hair_shade_rank(sf."currentHairColor"),
    lookup_eye_hue(sf."eyeColor"),
    lookup_eye_shade(sf."eyeColor"),
    lookup_eye_shade_rank(sf."eyeColor"),
    lookup_skin_tone(aa."currentAttributes" ->> 'skin_tone'),
    lookup_skin_tone_rank(aa."currentAttributes" ->> 'skin_tone'),
    lookup_skin_undertone(aa."currentAttributes" ->> 'skin_tone'),
    COALESCE(aa."currentAttributes", '{}'::jsonb),
    COALESCE(asg."attributeStatuses", '{}'::jsonb),
    COALESCE(ba."baselineAttributes", '{}'::jsonb),
    COALESCE(bm."tattooRegions",         '{}'::text[]),
    COALESCE(bm."scarRegions",           '{}'::text[]),
    COALESCE(bmod."piercingRegions",     '{}'::text[]),
    COALESCE(bmod."modificationRegions", '{}'::text[]),
    COALESCE(cp."procedureRegions",      '{}'::text[]),
    COALESCE(pt."presentBodyFeatureTypes", '{}'::text[]),
    now()
  FROM "Person" p
  LEFT JOIN scalar_folded        sf   ON sf."personId"  = p.id
  LEFT JOIN attr_agg             aa   ON aa."personId"  = p.id
  LEFT JOIN attribute_statuses   asg  ON asg."personId" = p.id
  LEFT JOIN baseline_attr_agg    ba   ON ba."personId"  = p.id
  LEFT JOIN body_mark_agg        bm   ON bm."personId"  = p.id
  LEFT JOIN body_mod_agg         bmod ON bmod."personId" = p.id
  LEFT JOIN procedure_agg        cp   ON cp."personId"  = p.id
  LEFT JOIN present_types_agg    pt   ON pt."personId"  = p.id
  WHERE p_id IS NULL OR p.id = p_id
  ON CONFLICT ("personId") DO UPDATE SET
    "eyeColor"               = EXCLUDED."eyeColor",
    "currentHairColor"       = EXCLUDED."currentHairColor",
    "currentWeight"          = EXCLUDED."currentWeight",
    "currentBuild"           = EXCLUDED."currentBuild",
    "hairHue"                = EXCLUDED."hairHue",
    "hairLightness"          = EXCLUDED."hairLightness",
    "hairLightnessRank"      = EXCLUDED."hairLightnessRank",
    "eyeHue"                 = EXCLUDED."eyeHue",
    "eyeLightness"           = EXCLUDED."eyeLightness",
    "eyeLightnessRank"       = EXCLUDED."eyeLightnessRank",
    "skinTone"               = EXCLUDED."skinTone",
    "skinToneRank"           = EXCLUDED."skinToneRank",
    "skinUndertone"          = EXCLUDED."skinUndertone",
    "currentAttributes"      = EXCLUDED."currentAttributes",
    "attributeStatuses"      = EXCLUDED."attributeStatuses",
    "baselineAttributes"     = EXCLUDED."baselineAttributes",
    "tattooRegions"          = EXCLUDED."tattooRegions",
    "scarRegions"            = EXCLUDED."scarRegions",
    "piercingRegions"        = EXCLUDED."piercingRegions",
    "modificationRegions"    = EXCLUDED."modificationRegions",
    "procedureRegions"       = EXCLUDED."procedureRegions",
    "presentBodyFeatureTypes" = EXCLUDED."presentBodyFeatureTypes",
    "updatedAt"              = now();
$function$;

-- Now drop the boolean columns.
ALTER TABLE "PersonCurrentState"
  DROP COLUMN "hasTattoo",
  DROP COLUMN "hasScar",
  DROP COLUMN "hasPiercing",
  DROP COLUMN "hasModification",
  DROP COLUMN "hasProcedure";

-- Idempotent refresh so the new fold path is exercised end-to-end.
-- (No-op for column values — the booleans are gone — but keeps the
-- recompute hook warm in case future fold logic depends on it.)
SELECT app_recompute_person_current_state();
