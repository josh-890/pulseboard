-- Phase C2 — rewrite app_recompute_person_current_state to fold ScalarDelta
-- instead of PersonaPhysical / PersonaPhysicalAttribute.
--
-- The folded current value of an attribute is its latest delta: ordered by
-- era (baseline first), then the delta's effective date COALESCE(delta, era).
-- hair_color / weight / build keep dedicated cache columns; every other
-- attribute folds into the currentAttributes JSONB.

CREATE OR REPLACE FUNCTION app_recompute_person_current_state(p_id TEXT DEFAULT NULL)
RETURNS void
LANGUAGE sql
AS $fn$
  WITH delta_ranked AS (
    SELECT
      e."personId",
      pad.slug,
      sd.value,
      row_number() OVER (
        PARTITION BY e."personId", sd."attributeDefinitionId"
        ORDER BY e."isBaseline" ASC,
                 COALESCE(sd.date, e.date) DESC NULLS LAST,
                 sd."createdAt" DESC,
                 sd.id DESC
      ) AS rn
    FROM "ScalarDelta" sd
    JOIN "Persona" e ON e.id = sd."eraId"
    JOIN "PhysicalAttributeDefinition" pad ON pad.id = sd."attributeDefinitionId"
    WHERE (p_id IS NULL OR e."personId" = p_id) AND trim(sd.value) <> ''
  ),
  delta_latest AS (
    SELECT "personId", slug, value FROM delta_ranked WHERE rn = 1
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
    "currentAttributes",
    "hasTattoo", "hasScar", "hasPiercing", "hasModification", "hasProcedure",
    "tattooRegions", "scarRegions", "piercingRegions", "modificationRegions", "procedureRegions",
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
  LEFT JOIN scalar_folded sf   ON sf."personId"   = p.id
  LEFT JOIN attr_agg      aa   ON aa."personId"   = p.id
  LEFT JOIN body_mark_agg bm   ON bm."personId"   = p.id
  LEFT JOIN body_mod_agg  bmod ON bmod."personId" = p.id
  LEFT JOIN procedure_agg cp   ON cp."personId"   = p.id
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
$fn$;

-- Rebuild every row through the new fold.
SELECT app_recompute_person_current_state();
