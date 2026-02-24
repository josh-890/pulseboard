-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('UNKNOWN', 'YEAR', 'MONTH', 'DAY');

-- CreateEnum
CREATE TYPE "BodyModificationType" AS ENUM ('piercing', 'stretching', 'branding', 'scarification', 'implant', 'teeth', 'jewelry', 'other');

-- CreateEnum
CREATE TYPE "BodyModificationStatus" AS ENUM ('present', 'removed', 'overgrown', 'modified');

-- CreateEnum
CREATE TYPE "BodyModificationEventType" AS ENUM ('added', 'modified', 'removed');

-- CreateEnum
CREATE TYPE "CosmeticProcedureEventType" AS ENUM ('performed', 'revised', 'reversed');

-- CreateEnum
CREATE TYPE "EducationType" AS ENUM ('primary', 'secondary', 'undergraduate', 'graduate', 'postgraduate', 'vocational', 'continuing', 'other');

-- CreateEnum
CREATE TYPE "AwardType" AS ENUM ('degree', 'certificate', 'license', 'award', 'honor', 'other');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('professional', 'personal', 'familial', 'other');

-- CreateEnum
CREATE TYPE "RelationshipEventType" AS ENUM ('started', 'married', 'separated', 'divorced', 'ended', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE 'bodyModification';
ALTER TYPE "EntityType" ADD VALUE 'cosmeticProcedure';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthMarks" TEXT,
ADD COLUMN     "birthdatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "retiredIn" INTEGER;

-- AlterTable
ALTER TABLE "PersonDigitalIdentity" ADD COLUMN     "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "PersonRelationship" ADD COLUMN     "context" TEXT,
ADD COLUMN     "type" "RelationshipType",
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "validTo" TIMESTAMP(3),
ADD COLUMN     "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "PersonSkill" ADD COLUMN     "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Persona" ADD COLUMN     "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Set" ADD COLUMN     "releaseDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "BodyModification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "BodyModificationType" NOT NULL,
    "bodyRegion" TEXT NOT NULL,
    "side" TEXT,
    "position" TEXT,
    "description" TEXT,
    "material" TEXT,
    "gauge" TEXT,
    "status" "BodyModificationStatus" NOT NULL DEFAULT 'present',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyModification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyModificationEvent" (
    "id" TEXT NOT NULL,
    "bodyModificationId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "eventType" "BodyModificationEventType" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BodyModificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticProcedure" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bodyRegion" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticProcedureEvent" (
    "id" TEXT NOT NULL,
    "cosmeticProcedureId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "eventType" "CosmeticProcedureEventType" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CosmeticProcedureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonEducation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "EducationType" NOT NULL,
    "institution" TEXT NOT NULL,
    "field" TEXT,
    "degree" TEXT,
    "startDate" TIMESTAMP(3),
    "startDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "endDate" TIMESTAMP(3),
    "endDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonAward" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "AwardType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "date" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "context" TEXT,
    "url" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonInterest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "level" TEXT,
    "validFrom" TIMESTAMP(3),
    "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "validTo" TIMESTAMP(3),
    "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipEvent" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "eventType" "RelationshipEventType" NOT NULL,
    "date" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationshipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyModification_personId_idx" ON "BodyModification"("personId");

-- CreateIndex
CREATE INDEX "BodyModification_type_idx" ON "BodyModification"("type");

-- CreateIndex
CREATE INDEX "BodyModification_status_idx" ON "BodyModification"("status");

-- CreateIndex
CREATE INDEX "BodyModification_deletedAt_idx" ON "BodyModification"("deletedAt");

-- CreateIndex
CREATE INDEX "BodyModificationEvent_bodyModificationId_idx" ON "BodyModificationEvent"("bodyModificationId");

-- CreateIndex
CREATE INDEX "BodyModificationEvent_personaId_idx" ON "BodyModificationEvent"("personaId");

-- CreateIndex
CREATE INDEX "BodyModificationEvent_deletedAt_idx" ON "BodyModificationEvent"("deletedAt");

-- CreateIndex
CREATE INDEX "CosmeticProcedure_personId_idx" ON "CosmeticProcedure"("personId");

-- CreateIndex
CREATE INDEX "CosmeticProcedure_deletedAt_idx" ON "CosmeticProcedure"("deletedAt");

-- CreateIndex
CREATE INDEX "CosmeticProcedureEvent_cosmeticProcedureId_idx" ON "CosmeticProcedureEvent"("cosmeticProcedureId");

-- CreateIndex
CREATE INDEX "CosmeticProcedureEvent_personaId_idx" ON "CosmeticProcedureEvent"("personaId");

-- CreateIndex
CREATE INDEX "CosmeticProcedureEvent_deletedAt_idx" ON "CosmeticProcedureEvent"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonEducation_personId_idx" ON "PersonEducation"("personId");

-- CreateIndex
CREATE INDEX "PersonEducation_deletedAt_idx" ON "PersonEducation"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonAward_personId_idx" ON "PersonAward"("personId");

-- CreateIndex
CREATE INDEX "PersonAward_deletedAt_idx" ON "PersonAward"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonInterest_personId_idx" ON "PersonInterest"("personId");

-- CreateIndex
CREATE INDEX "PersonInterest_deletedAt_idx" ON "PersonInterest"("deletedAt");

-- CreateIndex
CREATE INDEX "RelationshipEvent_relationshipId_idx" ON "RelationshipEvent"("relationshipId");

-- CreateIndex
CREATE INDEX "RelationshipEvent_deletedAt_idx" ON "RelationshipEvent"("deletedAt");

-- AddForeignKey
ALTER TABLE "BodyModification" ADD CONSTRAINT "BodyModification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyModificationEvent" ADD CONSTRAINT "BodyModificationEvent_bodyModificationId_fkey" FOREIGN KEY ("bodyModificationId") REFERENCES "BodyModification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyModificationEvent" ADD CONSTRAINT "BodyModificationEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticProcedure" ADD CONSTRAINT "CosmeticProcedure_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticProcedureEvent" ADD CONSTRAINT "CosmeticProcedureEvent_cosmeticProcedureId_fkey" FOREIGN KEY ("cosmeticProcedureId") REFERENCES "CosmeticProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticProcedureEvent" ADD CONSTRAINT "CosmeticProcedureEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEducation" ADD CONSTRAINT "PersonEducation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAward" ADD CONSTRAINT "PersonAward_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonInterest" ADD CONSTRAINT "PersonInterest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipEvent" ADD CONSTRAINT "RelationshipEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "PersonRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Backfill: existing non-null dates → DAY precision ──────────────────────

UPDATE "Person" SET "birthdatePrecision" = 'DAY' WHERE birthdate IS NOT NULL;
UPDATE "Persona" SET "datePrecision" = 'DAY' WHERE date IS NOT NULL;
UPDATE "Session" SET "datePrecision" = 'DAY' WHERE date IS NOT NULL;
UPDATE "Set" SET "releaseDatePrecision" = 'DAY' WHERE "releaseDate" IS NOT NULL;
UPDATE "PersonDigitalIdentity" SET "validFromPrecision" = 'DAY' WHERE "validFrom" IS NOT NULL;
UPDATE "PersonDigitalIdentity" SET "validToPrecision" = 'DAY' WHERE "validTo" IS NOT NULL;
UPDATE "PersonSkill" SET "validFromPrecision" = 'DAY' WHERE "validFrom" IS NOT NULL;
UPDATE "PersonSkill" SET "validToPrecision" = 'DAY' WHERE "validTo" IS NOT NULL;

-- ─── SQL Function: compute_age_at ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_age_at(
  birth_date TIMESTAMP, birth_prec TEXT,
  event_date TIMESTAMP, event_prec TEXT
) RETURNS TEXT AS $$
DECLARE
  years INT;
BEGIN
  IF birth_date IS NULL OR event_date IS NULL THEN RETURN NULL; END IF;
  IF birth_prec = 'UNKNOWN' OR event_prec = 'UNKNOWN' THEN RETURN NULL; END IF;
  years := EXTRACT(YEAR FROM event_date)::INT - EXTRACT(YEAR FROM birth_date)::INT;
  IF birth_prec = 'DAY' THEN
    IF EXTRACT(MONTH FROM event_date) < EXTRACT(MONTH FROM birth_date)
       OR (EXTRACT(MONTH FROM event_date) = EXTRACT(MONTH FROM birth_date)
           AND EXTRACT(DAY FROM event_date) < EXTRACT(DAY FROM birth_date)) THEN
      years := years - 1;
    END IF;
  END IF;
  IF birth_prec != 'DAY' OR event_prec != 'DAY' THEN
    RETURN '~' || years::TEXT;
  END IF;
  RETURN years::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── View: v_person_list ────────────────────────────────────────────────────

CREATE VIEW v_person_list AS
SELECT
  p.id, p."icgId", p.status, p.rating, p.pgrade, p.tags,
  p."naturalHairColor", p."bodyType", p.ethnicity, p.location,
  p."activeSince", p."retiredIn", p.specialization, p."createdAt",
  p.birthdate, p."birthdatePrecision", p.nationality, p."sexAtBirth", p.height,
  (SELECT pa.name FROM "PersonAlias" pa
   WHERE pa."personId" = p.id AND pa.type = 'common' AND pa."deletedAt" IS NULL LIMIT 1) AS "commonAlias",
  (SELECT pa.name FROM "PersonAlias" pa
   WHERE pa."personId" = p.id AND pa.type = 'birth' AND pa."deletedAt" IS NULL LIMIT 1) AS "birthAlias",
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT, NOW()::TIMESTAMP, 'DAY') AS "currentAge",
  CASE WHEN p."activeSince" IS NOT NULL AND p.birthdate IS NOT NULL
    THEN (p."activeSince" - EXTRACT(YEAR FROM p.birthdate)::INT)::TEXT ELSE NULL
  END AS "careerStartAge",
  (SELECT COUNT(*) FROM "BodyMark" bm
   WHERE bm."personId" = p.id AND bm.status = 'present' AND bm."deletedAt" IS NULL)::INT AS "activeBodyMarkCount",
  (SELECT COUNT(*) FROM "SetContribution" sc
   WHERE sc."personId" = p.id AND sc."deletedAt" IS NULL)::INT AS "setCount"
FROM "Person" p WHERE p."deletedAt" IS NULL;

-- ─── View: v_person_work_history ────────────────────────────────────────────

CREATE VIEW v_person_work_history AS
SELECT
  sc."personId", s.id AS "setId", s.title AS "setTitle", s.type AS "setType", sc.role,
  s."releaseDate", s."releaseDatePrecision",
  ch.name AS "channelName", l.id AS "labelId", l.name AS "labelName",
  proj.name AS "projectName", proj.id AS "projectId",
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT,
    s."releaseDate", s."releaseDatePrecision"::TEXT) AS "ageAtRelease"
FROM "SetContribution" sc
JOIN "Set" s ON s.id = sc."setId" AND s."deletedAt" IS NULL
JOIN "Session" sess ON sess.id = s."sessionId" AND sess."deletedAt" IS NULL
JOIN "Project" proj ON proj.id = sess."projectId" AND proj."deletedAt" IS NULL
JOIN "Person" p ON p.id = sc."personId" AND p."deletedAt" IS NULL
LEFT JOIN "Channel" ch ON ch.id = s."channelId" AND ch."deletedAt" IS NULL
LEFT JOIN "Label" l ON l.id = ch."labelId" AND l."deletedAt" IS NULL
WHERE sc."deletedAt" IS NULL;

-- ─── View: v_person_body_events ─────────────────────────────────────────────

CREATE VIEW v_person_body_events AS
-- Body marks (SMT)
SELECT p.id AS "personId", 'body_mark' AS "category", bm.type::TEXT AS "eventType",
  bm."bodyRegion", bm.side, bm.description, bme."eventType"::TEXT AS "changeType",
  per.date AS "eventDate", per."datePrecision"::TEXT AS "eventDatePrecision",
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT, per.date, per."datePrecision"::TEXT) AS "ageAtEvent",
  bm.id AS "sourceId", bme.id AS "eventId"
FROM "BodyMarkEvent" bme
JOIN "BodyMark" bm ON bm.id = bme."bodyMarkId" AND bm."deletedAt" IS NULL
JOIN "Persona" per ON per.id = bme."personaId" AND per."deletedAt" IS NULL
JOIN "Person" p ON p.id = bm."personId" AND p."deletedAt" IS NULL
WHERE bme."deletedAt" IS NULL
UNION ALL
-- Body modifications
SELECT p.id, 'body_modification', bmod.type::TEXT,
  bmod."bodyRegion", bmod.side, bmod.description, bmode."eventType"::TEXT,
  per.date, per."datePrecision"::TEXT,
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT, per.date, per."datePrecision"::TEXT),
  bmod.id, bmode.id
FROM "BodyModificationEvent" bmode
JOIN "BodyModification" bmod ON bmod.id = bmode."bodyModificationId" AND bmod."deletedAt" IS NULL
JOIN "Persona" per ON per.id = bmode."personaId" AND per."deletedAt" IS NULL
JOIN "Person" p ON p.id = bmod."personId" AND p."deletedAt" IS NULL
WHERE bmode."deletedAt" IS NULL
UNION ALL
-- Cosmetic procedures
SELECT p.id, 'cosmetic_procedure', cp.type,
  cp."bodyRegion", NULL, cp.description, cpe."eventType"::TEXT,
  per.date, per."datePrecision"::TEXT,
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT, per.date, per."datePrecision"::TEXT),
  cp.id, cpe.id
FROM "CosmeticProcedureEvent" cpe
JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId" AND cp."deletedAt" IS NULL
JOIN "Persona" per ON per.id = cpe."personaId" AND per."deletedAt" IS NULL
JOIN "Person" p ON p.id = cp."personId" AND p."deletedAt" IS NULL
WHERE cpe."deletedAt" IS NULL;

-- ─── Materialized View: mv_dashboard_stats ──────────────────────────────────

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM "Person" WHERE "deletedAt" IS NULL) AS "personCount",
  (SELECT COUNT(*) FROM "Set" WHERE "deletedAt" IS NULL) AS "setCount",
  (SELECT COUNT(*) FROM "Label" WHERE "deletedAt" IS NULL) AS "labelCount",
  (SELECT COUNT(*) FROM "Channel" WHERE "deletedAt" IS NULL) AS "channelCount",
  (SELECT COUNT(*) FROM "Project" WHERE "deletedAt" IS NULL) AS "projectCount";

-- ─── Materialized View: mv_person_current_state ─────────────────────────────

CREATE MATERIALIZED VIEW mv_person_current_state AS
WITH ordered AS (
  SELECT per."personId",
    pp."currentHairColor", pp.weight, pp.build, pp."visionAids", pp."fitnessLevel",
    ROW_NUMBER() OVER (PARTITION BY per."personId"
      ORDER BY per."isBaseline" DESC, per.date ASC NULLS FIRST) AS rn
  FROM "Persona" per
  JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
  WHERE per."deletedAt" IS NULL
),
folded AS (
  SELECT "personId",
    MAX("currentHairColor") FILTER (WHERE "currentHairColor" IS NOT NULL)
      OVER w AS "currentHairColor",
    MAX(weight) FILTER (WHERE weight IS NOT NULL) OVER w AS "currentWeight",
    MAX(build) FILTER (WHERE build IS NOT NULL) OVER w AS "currentBuild",
    MAX("visionAids") FILTER (WHERE "visionAids" IS NOT NULL) OVER w AS "currentVisionAids",
    MAX("fitnessLevel") FILTER (WHERE "fitnessLevel" IS NOT NULL) OVER w AS "currentFitnessLevel",
    rn, MAX(rn) OVER (PARTITION BY "personId") AS max_rn
  FROM ordered
  WINDOW w AS (PARTITION BY "personId" ORDER BY rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT "personId", "currentHairColor", "currentWeight", "currentBuild",
  "currentVisionAids", "currentFitnessLevel"
FROM folded WHERE rn = max_rn;

CREATE UNIQUE INDEX ON mv_person_current_state ("personId");

-- ─── Materialized View: mv_person_affiliations ──────────────────────────────

CREATE MATERIALIZED VIEW mv_person_affiliations AS
SELECT sc."personId", l.id AS "labelId", l.name AS "labelName",
  COUNT(DISTINCT s.id)::INT AS "setCount"
FROM "SetContribution" sc
JOIN "Set" s ON s.id = sc."setId" AND s."deletedAt" IS NULL
JOIN "Session" sess ON sess.id = s."sessionId" AND sess."deletedAt" IS NULL
JOIN "Channel" ch ON ch.id = s."channelId" AND ch."deletedAt" IS NULL
JOIN "Label" l ON l.id = ch."labelId" AND l."deletedAt" IS NULL
WHERE sc."deletedAt" IS NULL
GROUP BY sc."personId", l.id, l.name;

CREATE UNIQUE INDEX ON mv_person_affiliations ("personId", "labelId");
