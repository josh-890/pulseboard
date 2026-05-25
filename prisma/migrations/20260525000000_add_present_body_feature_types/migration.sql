-- Phase G Slice 15 / project_identity_bearing_ui: hero type-presence chips.
--
-- Adds PersonCurrentState.presentBodyFeatureTypes — the union of distinct
-- mark.type + mod.type for the person's present (non-removed) body features.
-- Drives the hero's binary "does this person have a tattoo? a piercing?"
-- indicator, replacing the per-mark heroVisible/heroOrder UI.
--
-- The per-type hasTattoo/hasScar/hasPiercing/hasModification/hasProcedure
-- booleans STAY for now (people-search-service still queries them); Slice 17
-- drops them as part of the broader contraction.
--
-- The fold function `app_recompute_person_current_state` is REPLACED in full
-- (CREATE OR REPLACE FUNCTION) to also populate the new array.
--
-- Rollback: ALTER TABLE DROP COLUMN; restore the prior fold via git.

BEGIN;

ALTER TABLE "PersonCurrentState"
  ADD COLUMN "presentBodyFeatureTypes" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX "PersonCurrentState_presentBodyFeatureTypes_idx"
  ON "PersonCurrentState" USING GIN ("presentBodyFeatureTypes");

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
      max(value) FILTER (WHERE slug = 'build')      AS "currentBuild"
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
    WHERE bm.status <> 'removed' AND (p_id IS NULL OR bm."personId" = p_id)
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
    WHERE bmod.status <> 'removed' AND (p_id IS NULL OR bmod."personId" = p_id)
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
  ),
  -- Phase G Slice 15: union of distinct mark + modification types for the
  -- type-presence chips. Drawn from the same status<>'removed' filter as the
  -- has* booleans; procedures aren't included (Slice 5 dropped that UI).
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
    "currentAttributes", "attributeStatuses",
    "hasTattoo", "hasScar", "hasPiercing", "hasModification", "hasProcedure",
    "tattooRegions", "scarRegions", "piercingRegions", "modificationRegions", "procedureRegions",
    "presentBodyFeatureTypes",
    "updatedAt"
  )
  SELECT
    p.id,
    p."eyeColor",
    sf."currentHairColor",
    NULLIF(sf.weight_text, '')::double precision,
    sf."currentBuild",
    lookup_hair_hue(sf."currentHairColor"),
    lookup_hair_shade(sf."currentHairColor"),
    lookup_hair_shade_rank(sf."currentHairColor"),
    lookup_eye_hue(p."eyeColor"),
    lookup_eye_shade(p."eyeColor"),
    lookup_eye_shade_rank(p."eyeColor"),
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
    COALESCE(pt."presentBodyFeatureTypes", '{}'::text[]),
    now()
  FROM "Person" p
  LEFT JOIN scalar_folded sf       ON sf."personId"  = p.id
  LEFT JOIN attr_agg      aa       ON aa."personId"  = p.id
  LEFT JOIN attribute_statuses asg ON asg."personId" = p.id
  LEFT JOIN body_mark_agg bm       ON bm."personId"  = p.id
  LEFT JOIN body_mod_agg  bmod     ON bmod."personId" = p.id
  LEFT JOIN procedure_agg cp       ON cp."personId"  = p.id
  LEFT JOIN present_types_agg pt   ON pt."personId"  = p.id
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
    "presentBodyFeatureTypes" = EXCLUDED."presentBodyFeatureTypes",
    "updatedAt"           = now();
$function$;

-- Backfill: recompute every PersonCurrentState row so the new column populates.
SELECT app_recompute_person_current_state();

COMMIT;
