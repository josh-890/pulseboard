-- ══════════════════════════════════════════════════════════════════════════════
-- Temporal Uncertainty Foundation
-- Adds DateModifier enum, modifier+source columns on key date fields,
-- converts career fields from Int (activeSince/retiredIn) to DateTime
-- (activeFrom/retiredAt) with full temporal metadata.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. CreateEnum
CREATE TYPE "DateModifier" AS ENUM ('EXACT', 'APPROXIMATE', 'ESTIMATED', 'BEFORE', 'AFTER');

-- 2. Add new columns (Person — birthdate modifier/source + career fields)
ALTER TABLE "Person"
ADD COLUMN "birthdateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "birthdateSource" TEXT,
ADD COLUMN "activeFrom" TIMESTAMP(3),
ADD COLUMN "activeFromPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "activeFromModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "activeFromSource" TEXT,
ADD COLUMN "retiredAt" TIMESTAMP(3),
ADD COLUMN "retiredAtPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "retiredAtModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "retiredAtSource" TEXT;

-- 3. Backfill career fields from Int → DateTime (before dropping old columns)
UPDATE "Person"
SET "activeFrom" = make_date("activeSince", 1, 1),
    "activeFromPrecision" = 'YEAR'::"DatePrecision"
WHERE "activeSince" IS NOT NULL;

UPDATE "Person"
SET "retiredAt" = make_date("retiredIn", 1, 1),
    "retiredAtPrecision" = 'YEAR'::"DatePrecision"
WHERE "retiredIn" IS NOT NULL;

-- 4. Drop v_person_list view (depends on activeSince/retiredIn)
DROP VIEW IF EXISTS v_person_list;

-- 5. Drop old career columns
ALTER TABLE "Person" DROP COLUMN "activeSince",
DROP COLUMN "retiredIn";

-- 6. Add modifier+source columns on Persona, Session, Set
ALTER TABLE "Persona"
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "dateSource" TEXT;

ALTER TABLE "Session"
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "dateSource" TEXT;

ALTER TABLE "Set"
ADD COLUMN "releaseDateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "releaseDateSource" TEXT;

-- 7. Fix drifted defaults and index names
ALTER TABLE "BodyMark" ALTER COLUMN "bodyRegions" DROP DEFAULT;
ALTER TABLE "BodyModification" ALTER COLUMN "bodyRegions" DROP DEFAULT;
ALTER TABLE "CosmeticProcedure" ALTER COLUMN "bodyRegions" DROP DEFAULT;
ALTER TABLE "PersonMediaLink" ALTER COLUMN "bodyRegions" DROP DEFAULT;
ALTER INDEX "PersonaPhysicalAttribute_personaPhysicalId_attributeDefiniti_ke" RENAME TO "PersonaPhysicalAttribute_personaPhysicalId_attributeDefinit_key";

-- 8. Recreate v_person_list with new career fields
CREATE VIEW v_person_list AS
SELECT
  id,
  "icgId",
  status,
  rating,
  pgrade,
  tags,
  "naturalHairColor",
  "bodyType",
  ethnicity,
  location,
  "activeFrom",
  "activeFromPrecision",
  "retiredAt",
  "retiredAtPrecision",
  specialization,
  "createdAt",
  birthdate,
  "birthdatePrecision",
  nationality,
  "sexAtBirth",
  height,
  (SELECT pa.name FROM "PersonAlias" pa
    WHERE pa."personId" = p.id AND pa.type = 'common'::"AliasType"
    LIMIT 1) AS "commonAlias",
  (SELECT pa.name FROM "PersonAlias" pa
    WHERE pa."personId" = p.id AND pa.type = 'birth'::"AliasType"
    LIMIT 1) AS "birthAlias",
  compute_age_at(birthdate, "birthdatePrecision"::text, now()::timestamp without time zone, 'DAY'::text) AS "currentAge",
  CASE
    WHEN "activeFrom" IS NOT NULL AND birthdate IS NOT NULL
    THEN compute_age_at(birthdate, "birthdatePrecision"::text, "activeFrom", "activeFromPrecision"::text)
    ELSE NULL::text
  END AS "careerStartAge",
  ((SELECT count(*) FROM "BodyMark" bm
    WHERE bm."personId" = p.id AND bm.status = 'present'::"BodyMarkStatus"))::integer AS "activeBodyMarkCount",
  ((SELECT count(DISTINCT sp."setId") FROM "SetParticipant" sp
    JOIN "Set" s ON s.id = sp."setId"
    WHERE sp."personId" = p.id))::integer AS "setCount"
FROM "Person" p;
