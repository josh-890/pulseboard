-- Migration: replace PersonAlias.type (AliasType enum) with isCommon + isBirth boolean flags
-- "common" and "birth" are orthogonal properties, not mutually exclusive categories.

-- 1. Drop view that references AliasType cast
DROP VIEW IF EXISTS v_person_list;

-- 2. Add boolean columns with safe defaults
ALTER TABLE "PersonAlias" ADD COLUMN "isCommon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PersonAlias" ADD COLUMN "isBirth"  BOOLEAN NOT NULL DEFAULT false;

-- 3. Backfill from type column
UPDATE "PersonAlias" SET "isCommon" = true WHERE type = 'common';
UPDATE "PersonAlias" SET "isBirth"  = true WHERE type = 'birth';

-- 4. Drop the old type column and enum
ALTER TABLE "PersonAlias" DROP COLUMN "type";
DROP TYPE "AliasType";

-- 5. Partial unique indexes (cannot be expressed in Prisma schema SDL)
CREATE UNIQUE INDEX "PersonAlias_personId_isCommon_idx" ON "PersonAlias"("personId") WHERE "isCommon" = true;
CREATE UNIQUE INDEX "PersonAlias_personId_isBirth_idx"  ON "PersonAlias"("personId") WHERE "isBirth"  = true;

-- 6. Recreate v_person_list with updated alias subqueries
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
    WHERE pa."personId" = p.id AND pa."isCommon" = true
    LIMIT 1) AS "commonAlias",
  (SELECT pa.name FROM "PersonAlias" pa
    WHERE pa."personId" = p.id AND pa."isBirth" = true
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
