-- Phase B — PersonCurrentState cache table, replacing the mv_person_current_state
-- materialized view (ADR-0003). The fold logic is a verbatim port of the MV body,
-- person-scopeable, run as an INSERT … ON CONFLICT upsert via a SQL function.

-- ─── 1. Cache table ──────────────────────────────────────────────────────────

CREATE TABLE "PersonCurrentState" (
  "personId"            TEXT PRIMARY KEY,
  "eyeColor"            TEXT,
  "currentHairColor"    TEXT,
  "currentWeight"       DOUBLE PRECISION,
  "currentBuild"        TEXT,
  "hairHue"             TEXT,
  "hairLightness"       TEXT,
  "hairLightnessRank"   INTEGER,
  "eyeHue"              TEXT,
  "eyeLightness"        TEXT,
  "eyeLightnessRank"    INTEGER,
  "skinTone"            TEXT,
  "skinToneRank"        INTEGER,
  "skinUndertone"       TEXT,
  "currentAttributes"   JSONB NOT NULL DEFAULT '{}',
  "attributeStatuses"   JSONB NOT NULL DEFAULT '{}',
  "hasTattoo"           BOOLEAN NOT NULL DEFAULT false,
  "hasScar"             BOOLEAN NOT NULL DEFAULT false,
  "hasPiercing"         BOOLEAN NOT NULL DEFAULT false,
  "hasModification"     BOOLEAN NOT NULL DEFAULT false,
  "hasProcedure"        BOOLEAN NOT NULL DEFAULT false,
  "tattooRegions"       TEXT[] NOT NULL DEFAULT '{}',
  "scarRegions"         TEXT[] NOT NULL DEFAULT '{}',
  "piercingRegions"     TEXT[] NOT NULL DEFAULT '{}',
  "modificationRegions" TEXT[] NOT NULL DEFAULT '{}',
  "procedureRegions"    TEXT[] NOT NULL DEFAULT '{}',
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonCurrentState_personId_fkey" FOREIGN KEY ("personId")
    REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes mirror the dropped MV's index set (search / facets / region filters).
CREATE INDEX "PersonCurrentState_currentAttributes_idx"   ON "PersonCurrentState" USING GIN ("currentAttributes" jsonb_path_ops);
CREATE INDEX "PersonCurrentState_tattooRegions_idx"        ON "PersonCurrentState" USING GIN ("tattooRegions");
CREATE INDEX "PersonCurrentState_scarRegions_idx"          ON "PersonCurrentState" USING GIN ("scarRegions");
CREATE INDEX "PersonCurrentState_piercingRegions_idx"      ON "PersonCurrentState" USING GIN ("piercingRegions");
CREATE INDEX "PersonCurrentState_modificationRegions_idx"  ON "PersonCurrentState" USING GIN ("modificationRegions");
CREATE INDEX "PersonCurrentState_procedureRegions_idx"     ON "PersonCurrentState" USING GIN ("procedureRegions");
CREATE INDEX "PersonCurrentState_hairHue_idx"              ON "PersonCurrentState" ("hairHue");
CREATE INDEX "PersonCurrentState_hairLightnessRank_idx"    ON "PersonCurrentState" ("hairLightnessRank");
CREATE INDEX "PersonCurrentState_eyeHue_idx"               ON "PersonCurrentState" ("eyeHue");
CREATE INDEX "PersonCurrentState_eyeLightnessRank_idx"     ON "PersonCurrentState" ("eyeLightnessRank");
CREATE INDEX "PersonCurrentState_skinToneRank_idx"         ON "PersonCurrentState" ("skinToneRank");
CREATE INDEX "PersonCurrentState_skinUndertone_idx"        ON "PersonCurrentState" ("skinUndertone");
CREATE INDEX "PersonCurrentState_hasTattoo_idx"            ON "PersonCurrentState" ("hasTattoo");
CREATE INDEX "PersonCurrentState_hasScar_idx"              ON "PersonCurrentState" ("hasScar");
CREATE INDEX "PersonCurrentState_hasPiercing_idx"          ON "PersonCurrentState" ("hasPiercing");

-- ─── 2. Recompute function ───────────────────────────────────────────────────
-- Verbatim port of the mv_person_current_state body, with an optional person
-- filter (p_id NULL = all persons). Phase C rewrites the fold to read ScalarDelta.

CREATE OR REPLACE FUNCTION app_recompute_person_current_state(p_id TEXT DEFAULT NULL)
RETURNS void
LANGUAGE sql
AS $fn$
  WITH ordered AS (
    SELECT
      per."personId",
      pp."currentHairColor",
      pp.weight,
      pp.build,
      row_number() OVER (PARTITION BY per."personId" ORDER BY per."isBaseline" DESC, per.date NULLS FIRST) AS rn
    FROM "Persona" per
    JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
    WHERE p_id IS NULL OR per."personId" = p_id
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
    FROM folded WHERE rn = max_rn
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
      AND (p_id IS NULL OR per."personId" = p_id)
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
    FROM attr_latest GROUP BY "personId"
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
    ft."currentHairColor",
    ft."currentWeight",
    ft."currentBuild",
    lookup_hair_hue(ft."currentHairColor"),
    lookup_hair_shade(ft."currentHairColor"),
    lookup_hair_shade_rank(ft."currentHairColor"),
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
  LEFT JOIN folded_top    ft   ON ft."personId"   = p.id
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

-- ─── 3. Initial population ───────────────────────────────────────────────────

SELECT app_recompute_person_current_state(NULL);

-- ─── 4. Drop the superseded materialized view ────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;
