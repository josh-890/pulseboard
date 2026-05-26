-- Slug typo follow-up to 20260526000000_fold_eye_color_from_delta.
--
-- The previous migration filtered on `slug = 'eye_color'` (snake_case) but the
-- Eye Color definition's actual slug is `'eye-color'` (kebab-case — slug naming
-- is inconsistent across the catalog: hair_color/weight/build/breast_size use
-- snake, eye-color/ethnicity-broad/ethnicity-specific use kebab). The fold
-- silently dropped every eye-color delta, leaving currentState.eyeColor /
-- eyeHue / eyeLightness null. The Appearance card still rendered the value
-- because the static section reads extensibleAttributes by defId, not via the
-- cache column — so the bug was invisible until advanced-search filtered on
-- `mv."eyeHue"` and found no rows.
--
-- The function body is identical to the previous migration apart from the
-- single corrected slug literal. Cache is recomputed for all persons.

CREATE OR REPLACE FUNCTION public.app_recompute_person_current_state(p_id text DEFAULT NULL::text)
RETURNS void
LANGUAGE sql
AS $function$
  WITH delta_ranked AS (
    SELECT
      e."personId",
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
      bool_or(mark_type = 'tattoo') AS "hasTattoo",
      bool_or(mark_type = 'scar')   AS "hasScar",
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
      bool_or(mod_type = 'piercing')  AS "hasPiercing",
      bool_or(mod_type <> 'piercing') AS "hasModification",
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
    SELECT "personId", true AS "hasProcedure",
      coalesce(array_agg(DISTINCT region), '{}'::text[]) AS "procedureRegions"
    FROM cp_unnest GROUP BY "personId"
  )
  INSERT INTO "PersonCurrentState" (
    "personId", "eyeColor", "currentHairColor", "currentWeight", "currentBuild",
    "hairHue", "hairLightness", "hairLightnessRank",
    "eyeHue", "eyeLightness", "eyeLightnessRank",
    "skinTone", "skinToneRank", "skinUndertone",
    "currentAttributes", "attributeStatuses",
    "hasTattoo", "hasScar", "hasPiercing", "hasModification", "hasProcedure",
    "tattooRegions", "scarRegions", "piercingRegions", "modificationRegions", "procedureRegions",
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
    COALESCE(bm."hasTattoo",         false),
    COALESCE(bm."hasScar",           false),
    COALESCE(bmod."hasPiercing",     false),
    COALESCE(bmod."hasModification", false),
    COALESCE(cp."hasProcedure",      false),
    COALESCE(bm."tattooRegions",         '{}'::text[]),
    COALESCE(bm."scarRegions",           '{}'::text[]),
    COALESCE(bmod."piercingRegions",     '{}'::text[]),
    COALESCE(bmod."modificationRegions", '{}'::text[]),
    COALESCE(cp."procedureRegions",      '{}'::text[]),
    now()
  FROM "Person" p
  LEFT JOIN scalar_folded sf       ON sf."personId"  = p.id
  LEFT JOIN attr_agg      aa       ON aa."personId"  = p.id
  LEFT JOIN attribute_statuses asg ON asg."personId" = p.id
  LEFT JOIN body_mark_agg bm       ON bm."personId"  = p.id
  LEFT JOIN body_mod_agg  bmod     ON bmod."personId" = p.id
  LEFT JOIN procedure_agg cp       ON cp."personId"  = p.id
  WHERE p_id IS NULL OR p.id = p_id
  ON CONFLICT ("personId") DO UPDATE SET
    "eyeColor"            = EXCLUDED."eyeColor",
    "currentHairColor"    = EXCLUDED."currentHairColor",
    "currentWeight"       = EXCLUDED."currentWeight",
    "currentBuild"        = EXCLUDED."currentBuild",
    "hairHue"             = EXCLUDED."hairHue",
    "hairLightness"       = EXCLUDED."hairLightness",
    "hairLightnessRank"   = EXCLUDED."hairLightnessRank",
    "eyeHue"              = EXCLUDED."eyeHue",
    "eyeLightness"        = EXCLUDED."eyeLightness",
    "eyeLightnessRank"    = EXCLUDED."eyeLightnessRank",
    "skinTone"            = EXCLUDED."skinTone",
    "skinToneRank"        = EXCLUDED."skinToneRank",
    "skinUndertone"       = EXCLUDED."skinUndertone",
    "currentAttributes"   = EXCLUDED."currentAttributes",
    "attributeStatuses"   = EXCLUDED."attributeStatuses",
    "hasTattoo"           = EXCLUDED."hasTattoo",
    "hasScar"             = EXCLUDED."hasScar",
    "hasPiercing"         = EXCLUDED."hasPiercing",
    "hasModification"     = EXCLUDED."hasModification",
    "hasProcedure"        = EXCLUDED."hasProcedure",
    "tattooRegions"       = EXCLUDED."tattooRegions",
    "scarRegions"         = EXCLUDED."scarRegions",
    "piercingRegions"     = EXCLUDED."piercingRegions",
    "modificationRegions" = EXCLUDED."modificationRegions",
    "procedureRegions"    = EXCLUDED."procedureRegions",
    "updatedAt"           = now();
$function$;

-- Recompute the cache for all persons so eye color flows through.
SELECT app_recompute_person_current_state();
