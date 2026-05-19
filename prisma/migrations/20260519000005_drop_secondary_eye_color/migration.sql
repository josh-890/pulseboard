-- Back out the eye secondary-color infrastructure. Heterochromia is a flag,
-- not a paired-color search axis (consistent with NamUs, EHR ICD-10, casting
-- databases, and the hair backout). The Eye Pattern attribute already covers
-- the realistic "find heterochromia" filter.

DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;

ALTER TABLE "Person" DROP COLUMN IF EXISTS "secondaryEyeColor";

CREATE MATERIALIZED VIEW mv_person_current_state AS
WITH ordered AS (
  SELECT
    per."personId",
    pp."currentHairColor",
    pp.weight,
    pp.build,
    row_number() OVER (PARTITION BY per."personId" ORDER BY per."isBaseline" DESC, per.date NULLS FIRST) AS rn
  FROM "Persona" per
  JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
),
folded AS (
  SELECT
    ordered."personId",
    max(ordered."currentHairColor") FILTER (WHERE ordered."currentHairColor" IS NOT NULL) OVER w AS "currentHairColor",
    max(ordered.weight) FILTER (WHERE ordered.weight IS NOT NULL) OVER w AS "currentWeight",
    max(ordered.build) FILTER (WHERE ordered.build IS NOT NULL) OVER w AS "currentBuild",
    ordered.rn,
    max(ordered.rn) OVER (PARTITION BY ordered."personId") AS max_rn
  FROM ordered
  WINDOW w AS (PARTITION BY ordered."personId" ORDER BY ordered.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),
folded_top AS (
  SELECT "personId", "currentHairColor", "currentWeight", "currentBuild"
  FROM folded
  WHERE rn = max_rn
),
attr_ordered AS (
  SELECT
    per."personId",
    pad.slug,
    ppa.value,
    row_number() OVER (
      PARTITION BY per."personId", pad.id
      ORDER BY per."isBaseline" DESC, per.date NULLS FIRST
    ) AS rn
  FROM "Persona" per
  JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
  JOIN "PersonaPhysicalAttribute" ppa ON ppa."personaPhysicalId" = pp.id
  JOIN "PhysicalAttributeDefinition" pad ON pad.id = ppa."attributeDefinitionId"
  WHERE ppa.value IS NOT NULL AND trim(ppa.value) <> ''
),
attr_with_max AS (
  SELECT "personId", slug, value, rn,
    max(rn) OVER (PARTITION BY "personId", slug) AS max_rn
  FROM attr_ordered
),
attr_latest AS (
  SELECT "personId", slug, value FROM attr_with_max WHERE rn = max_rn
),
attr_agg AS (
  SELECT "personId", jsonb_object_agg(slug, value) AS "currentAttributes"
  FROM attr_latest
  GROUP BY "personId"
),
bm_unnest AS (
  SELECT bm."personId", bm.type::text AS mark_type, bm.status::text AS mark_status, region
  FROM "BodyMark" bm
  CROSS JOIN LATERAL unnest(bm."bodyRegions") AS region
  WHERE bm.status = 'present'
),
body_mark_agg AS (
  SELECT
    "personId",
    bool_or(mark_type = 'tattoo') AS "hasTattoo",
    bool_or(mark_type = 'scar')   AS "hasScar",
    coalesce(array_agg(DISTINCT region) FILTER (WHERE mark_type = 'tattoo'), '{}'::text[]) AS "tattooRegions",
    coalesce(array_agg(DISTINCT region) FILTER (WHERE mark_type = 'scar'),   '{}'::text[]) AS "scarRegions"
  FROM bm_unnest
  GROUP BY "personId"
),
bmod_unnest AS (
  SELECT bmod."personId", bmod.type::text AS mod_type, bmod.status::text AS mod_status, region
  FROM "BodyModification" bmod
  CROSS JOIN LATERAL unnest(bmod."bodyRegions") AS region
  WHERE bmod.status = 'present'
),
body_mod_agg AS (
  SELECT
    "personId",
    bool_or(mod_type = 'piercing') AS "hasPiercing",
    bool_or(mod_type <> 'piercing') AS "hasModification",
    coalesce(array_agg(DISTINCT region) FILTER (WHERE mod_type = 'piercing'),  '{}'::text[]) AS "piercingRegions",
    coalesce(array_agg(DISTINCT region) FILTER (WHERE mod_type <> 'piercing'), '{}'::text[]) AS "modificationRegions"
  FROM bmod_unnest
  GROUP BY "personId"
),
cp_unnest AS (
  SELECT cp."personId", cp.status, region
  FROM "CosmeticProcedure" cp
  CROSS JOIN LATERAL unnest(cp."bodyRegions") AS region
),
procedure_agg AS (
  SELECT
    "personId",
    true AS "hasProcedure",
    coalesce(array_agg(DISTINCT region), '{}'::text[]) AS "procedureRegions"
  FROM cp_unnest
  GROUP BY "personId"
)
SELECT
  p.id AS "personId",
  p."eyeColor",
  ft."currentHairColor",
  ft."currentWeight",
  ft."currentBuild",

  -- Primary hair (absolute Lightness via color_catalog)
  lookup_hair_hue(ft."currentHairColor")        AS "hairHue",
  lookup_hair_shade(ft."currentHairColor")      AS "hairLightness",
  lookup_hair_shade_rank(ft."currentHairColor") AS "hairLightnessRank",

  -- Primary eye. Heterochromia detected via "Eye Pattern" attribute, not as a
  -- second structured color (consistent with industry practice).
  lookup_eye_hue(p."eyeColor")        AS "eyeHue",
  lookup_eye_shade(p."eyeColor")      AS "eyeLightness",
  lookup_eye_shade_rank(p."eyeColor") AS "eyeLightnessRank",

  -- Skin (unchanged)
  lookup_skin_tone(aa."currentAttributes" ->> 'skin_tone')      AS "skinTone",
  lookup_skin_tone_rank(aa."currentAttributes" ->> 'skin_tone') AS "skinToneRank",
  lookup_skin_undertone(aa."currentAttributes" ->> 'skin_tone') AS "skinUndertone",

  COALESCE(aa."currentAttributes", '{}'::jsonb)            AS "currentAttributes",
  COALESCE(bm."hasTattoo",        false)                   AS "hasTattoo",
  COALESCE(bm."hasScar",          false)                   AS "hasScar",
  COALESCE(bmod."hasPiercing",    false)                   AS "hasPiercing",
  COALESCE(bmod."hasModification",false)                   AS "hasModification",
  COALESCE(cp."hasProcedure",     false)                   AS "hasProcedure",
  COALESCE(bm."tattooRegions",        '{}'::text[])        AS "tattooRegions",
  COALESCE(bm."scarRegions",          '{}'::text[])        AS "scarRegions",
  COALESCE(bmod."piercingRegions",    '{}'::text[])        AS "piercingRegions",
  COALESCE(bmod."modificationRegions",'{}'::text[])        AS "modificationRegions",
  COALESCE(cp."procedureRegions",     '{}'::text[])        AS "procedureRegions"
FROM "Person" p
LEFT JOIN folded_top    ft   ON ft."personId"   = p.id
LEFT JOIN attr_agg      aa   ON aa."personId"   = p.id
LEFT JOIN body_mark_agg bm   ON bm."personId"   = p.id
LEFT JOIN body_mod_agg  bmod ON bmod."personId" = p.id
LEFT JOIN procedure_agg cp   ON cp."personId"   = p.id;

CREATE UNIQUE INDEX mv_person_current_state_personid_idx ON mv_person_current_state ("personId");
CREATE INDEX mv_pcs_attrs_idx              ON mv_person_current_state USING GIN ("currentAttributes" jsonb_path_ops);
CREATE INDEX mv_pcs_tattoo_regions         ON mv_person_current_state USING GIN ("tattooRegions");
CREATE INDEX mv_pcs_scar_regions           ON mv_person_current_state USING GIN ("scarRegions");
CREATE INDEX mv_pcs_piercing_regions       ON mv_person_current_state USING GIN ("piercingRegions");
CREATE INDEX mv_pcs_mod_regions            ON mv_person_current_state USING GIN ("modificationRegions");
CREATE INDEX mv_pcs_proc_regions           ON mv_person_current_state USING GIN ("procedureRegions");
CREATE INDEX mv_pcs_hair_hue               ON mv_person_current_state ("hairHue");
CREATE INDEX mv_pcs_hair_lightness_rank    ON mv_person_current_state ("hairLightnessRank");
CREATE INDEX mv_pcs_eye_hue                ON mv_person_current_state ("eyeHue");
CREATE INDEX mv_pcs_eye_lightness_rank     ON mv_person_current_state ("eyeLightnessRank");
CREATE INDEX mv_pcs_skin_tone_rank         ON mv_person_current_state ("skinToneRank");
CREATE INDEX mv_pcs_skin_undertone         ON mv_person_current_state ("skinUndertone");
CREATE INDEX mv_pcs_has_tattoo             ON mv_person_current_state ("hasTattoo");
CREATE INDEX mv_pcs_has_scar               ON mv_person_current_state ("hasScar");
CREATE INDEX mv_pcs_has_piercing           ON mv_person_current_state ("hasPiercing");
