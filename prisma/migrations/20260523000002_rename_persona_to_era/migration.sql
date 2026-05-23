-- Phase E6 — physical Persona→Era table rename.
--
-- Until now the Era Prisma model has been `@@map("Persona")`-ed to the
-- legacy table, and 9 foreign-key columns kept their old `personaId` name
-- via `@map`. This migration drops the indirection: renames the table to
-- "Era", renames the 9 columns to "eraId" with their constraints/indexes,
-- and rebuilds the one view + one SQL function that still reference the
-- old names by string. The schema.prisma changes (drop @@map/@map) ship
-- in the same commit.

BEGIN;

-- ─── Drop the view that references the old names ─────────────────────────
-- v_person_body_events joins Persona by name and reads BodyMarkEvent.personaId
-- etc. — recreate it after the renames against the new names.
DROP VIEW IF EXISTS v_person_body_events;

-- ─── Rename the table and its dependent constraints/indexes ──────────────
ALTER TABLE "Persona" RENAME TO "Era";
ALTER INDEX "Persona_pkey" RENAME TO "Era_pkey";
ALTER INDEX "Persona_personId_idx" RENAME TO "Era_personId_idx";
ALTER TABLE "Era" RENAME CONSTRAINT "Persona_personId_fkey" TO "Era_personId_fkey";

-- ─── Rename personaId → eraId on every referring table ───────────────────
-- Each block: column, FK constraint, index.
ALTER TABLE "BodyMarkEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "BodyMarkEvent" RENAME CONSTRAINT "BodyMarkEvent_personaId_fkey" TO "BodyMarkEvent_eraId_fkey";
ALTER INDEX "BodyMarkEvent_personaId_idx" RENAME TO "BodyMarkEvent_eraId_idx";

ALTER TABLE "BodyModificationEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "BodyModificationEvent" RENAME CONSTRAINT "BodyModificationEvent_personaId_fkey" TO "BodyModificationEvent_eraId_fkey";
ALTER INDEX "BodyModificationEvent_personaId_idx" RENAME TO "BodyModificationEvent_eraId_idx";

ALTER TABLE "CosmeticProcedureEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "CosmeticProcedureEvent" RENAME CONSTRAINT "CosmeticProcedureEvent_personaId_fkey" TO "CosmeticProcedureEvent_eraId_fkey";
ALTER INDEX "CosmeticProcedureEvent_personaId_idx" RENAME TO "CosmeticProcedureEvent_eraId_idx";

ALTER TABLE "DigitalIdentityEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "DigitalIdentityEvent" RENAME CONSTRAINT "DigitalIdentityEvent_personaId_fkey" TO "DigitalIdentityEvent_eraId_fkey";
ALTER INDEX "DigitalIdentityEvent_personaId_idx" RENAME TO "DigitalIdentityEvent_eraId_idx";

ALTER TABLE "InterestEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "InterestEvent" RENAME CONSTRAINT "InterestEvent_personaId_fkey" TO "InterestEvent_eraId_fkey";
ALTER INDEX "InterestEvent_personaId_idx" RENAME TO "InterestEvent_eraId_idx";

ALTER TABLE "PersonDigitalIdentity" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "PersonDigitalIdentity" RENAME CONSTRAINT "PersonDigitalIdentity_personaId_fkey" TO "PersonDigitalIdentity_eraId_fkey";
ALTER INDEX "PersonDigitalIdentity_personaId_idx" RENAME TO "PersonDigitalIdentity_eraId_idx";

ALTER TABLE "PersonMediaLink" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "PersonMediaLink" RENAME CONSTRAINT "PersonMediaLink_personaId_fkey" TO "PersonMediaLink_eraId_fkey";
ALTER INDEX "PersonMediaLink_personaId_idx" RENAME TO "PersonMediaLink_eraId_idx";

ALTER TABLE "PersonSkill" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "PersonSkill" RENAME CONSTRAINT "PersonSkill_personaId_fkey" TO "PersonSkill_eraId_fkey";
ALTER INDEX "PersonSkill_personaId_idx" RENAME TO "PersonSkill_eraId_idx";

ALTER TABLE "PersonSkillEvent" RENAME COLUMN "personaId" TO "eraId";
ALTER TABLE "PersonSkillEvent" RENAME CONSTRAINT "PersonSkillEvent_personaId_fkey" TO "PersonSkillEvent_eraId_fkey";
ALTER INDEX "PersonSkillEvent_personaId_idx" RENAME TO "PersonSkillEvent_eraId_idx";

-- ScalarDelta already has an "eraId" column + "ScalarDelta_eraId_fkey"
-- constraint from Phase C2 — only its FK target oid changes (auto-updated
-- by Postgres when "Persona" was renamed).

-- ─── Recreate v_person_body_events against Era / eraId ───────────────────
CREATE VIEW v_person_body_events AS
SELECT p.id AS "personId",
    'body_mark'::text AS category,
    bm.type::text AS "eventType",
    bm."bodyRegion",
    bm.side,
    bm.description,
    bme."eventType"::text AS "changeType",
    COALESCE(bme.date, per.date) AS "eventDate",
    COALESCE(bme."datePrecision"::text, per."datePrecision"::text) AS "eventDatePrecision",
    compute_age_at(p.birthdate, p."birthdatePrecision"::text, COALESCE(bme.date, per.date), COALESCE(bme."datePrecision"::text, per."datePrecision"::text)) AS "ageAtEvent",
    bm.id AS "sourceId",
    bme.id AS "eventId"
   FROM "BodyMarkEvent" bme
     JOIN "BodyMark" bm ON bm.id = bme."bodyMarkId"
     JOIN "Era" per ON per.id = bme."eraId"
     JOIN "Person" p ON p.id = bm."personId"
UNION ALL
 SELECT p.id AS "personId",
    'body_modification'::text AS category,
    bmod.type::text AS "eventType",
    bmod."bodyRegion",
    bmod.side,
    bmod.description,
    bmode."eventType"::text AS "changeType",
    COALESCE(bmode.date, per.date) AS "eventDate",
    COALESCE(bmode."datePrecision"::text, per."datePrecision"::text) AS "eventDatePrecision",
    compute_age_at(p.birthdate, p."birthdatePrecision"::text, COALESCE(bmode.date, per.date), COALESCE(bmode."datePrecision"::text, per."datePrecision"::text)) AS "ageAtEvent",
    bmod.id AS "sourceId",
    bmode.id AS "eventId"
   FROM "BodyModificationEvent" bmode
     JOIN "BodyModification" bmod ON bmod.id = bmode."bodyModificationId"
     JOIN "Era" per ON per.id = bmode."eraId"
     JOIN "Person" p ON p.id = bmod."personId"
UNION ALL
 SELECT p.id AS "personId",
    'cosmetic_procedure'::text AS category,
    cp.type AS "eventType",
    cp."bodyRegion",
    NULL::text AS side,
    cp.description,
    cpe."eventType"::text AS "changeType",
    COALESCE(cpe.date, per.date) AS "eventDate",
    COALESCE(cpe."datePrecision"::text, per."datePrecision"::text) AS "eventDatePrecision",
    compute_age_at(p.birthdate, p."birthdatePrecision"::text, COALESCE(cpe.date, per.date), COALESCE(cpe."datePrecision"::text, per."datePrecision"::text)) AS "ageAtEvent",
    cp.id AS "sourceId",
    cpe.id AS "eventId"
   FROM "CosmeticProcedureEvent" cpe
     JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId"
     JOIN "Era" per ON per.id = cpe."eraId"
     JOIN "Person" p ON p.id = cp."personId";

-- ─── Rebuild app_recompute_person_current_state against "Era" ────────────
-- Only the table reference changes; the join column on the delta side was
-- already "eraId" from Phase C2.
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
    JOIN "Era" e ON e.id = sd."eraId"
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

COMMIT;
