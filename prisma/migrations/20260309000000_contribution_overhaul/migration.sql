-- Session Contribution Overhaul
-- Replaces SessionParticipant/SessionParticipantSkill/ParticipantRole with
-- ContributionRoleGroup/ContributionRoleDefinition/SessionContribution/ContributionSkill

-- ============================================================================
-- 1. Create new tables
-- ============================================================================

CREATE TABLE "ContributionRoleGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionRoleGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContributionRoleGroup_name_key" ON "ContributionRoleGroup"("name");
CREATE INDEX "ContributionRoleGroup_sortOrder_idx" ON "ContributionRoleGroup"("sortOrder");

CREATE TABLE "ContributionRoleDefinition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionRoleDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContributionRoleDefinition_slug_key" ON "ContributionRoleDefinition"("slug");
CREATE UNIQUE INDEX "ContributionRoleDefinition_groupId_name_key" ON "ContributionRoleDefinition"("groupId", "name");
CREATE INDEX "ContributionRoleDefinition_groupId_idx" ON "ContributionRoleDefinition"("groupId");
CREATE INDEX "ContributionRoleDefinition_sortOrder_idx" ON "ContributionRoleDefinition"("sortOrder");
ALTER TABLE "ContributionRoleDefinition" ADD CONSTRAINT "ContributionRoleDefinition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContributionRoleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Seed default role groups and definitions
INSERT INTO "ContributionRoleGroup" ("id", "name", "sortOrder") VALUES
  ('crg_on_camera', 'On-Camera', 1),
  ('crg_behind_camera', 'Behind Camera', 2);

INSERT INTO "ContributionRoleDefinition" ("id", "groupId", "name", "slug", "sortOrder") VALUES
  ('crd_model', 'crg_on_camera', 'Model', 'model', 1),
  ('crd_photographer', 'crg_behind_camera', 'Photographer', 'photographer', 1);

-- 3. Create SessionContribution
CREATE TABLE "SessionContribution" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "creditNameOverride" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionContribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionContribution_sessionId_personId_roleDefinitionId_key" ON "SessionContribution"("sessionId", "personId", "roleDefinitionId");
CREATE INDEX "SessionContribution_sessionId_idx" ON "SessionContribution"("sessionId");
CREATE INDEX "SessionContribution_personId_idx" ON "SessionContribution"("personId");
CREATE INDEX "SessionContribution_roleDefinitionId_idx" ON "SessionContribution"("roleDefinitionId");
ALTER TABLE "SessionContribution" ADD CONSTRAINT "SessionContribution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionContribution" ADD CONSTRAINT "SessionContribution_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionContribution" ADD CONSTRAINT "SessionContribution_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "ContributionRoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Backfill SessionContribution from SessionParticipant
INSERT INTO "SessionContribution" ("id", "sessionId", "personId", "roleDefinitionId", "creditNameOverride", "createdAt")
SELECT
  'sc_' || gen_random_uuid()::text,
  sp."sessionId",
  sp."personId",
  CASE sp.role
    WHEN 'MODEL' THEN 'crd_model'
    WHEN 'PHOTOGRAPHER' THEN 'crd_photographer'
  END,
  sp."creditNameOverride",
  sp."createdAt"
FROM "SessionParticipant" sp
ON CONFLICT ("sessionId", "personId", "roleDefinitionId") DO NOTHING;

-- 5. Create ContributionSkill
CREATE TABLE "ContributionSkill" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "skillDefinitionId" TEXT NOT NULL,
    "level" "SkillLevel",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContributionSkill_contributionId_skillDefinitionId_key" ON "ContributionSkill"("contributionId", "skillDefinitionId");
CREATE INDEX "ContributionSkill_contributionId_idx" ON "ContributionSkill"("contributionId");
CREATE INDEX "ContributionSkill_skillDefinitionId_idx" ON "ContributionSkill"("skillDefinitionId");
ALTER TABLE "ContributionSkill" ADD CONSTRAINT "ContributionSkill_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "SessionContribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionSkill" ADD CONSTRAINT "ContributionSkill_skillDefinitionId_fkey" FOREIGN KEY ("skillDefinitionId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Backfill ContributionSkill from SessionParticipantSkill
INSERT INTO "ContributionSkill" ("id", "contributionId", "skillDefinitionId", "level", "notes", "createdAt")
SELECT
  'cs_' || gen_random_uuid()::text,
  sc."id",
  sps."skillDefinitionId",
  sps."level",
  sps."notes",
  sps."createdAt"
FROM "SessionParticipantSkill" sps
JOIN "SessionContribution" sc
  ON sc."sessionId" = sps."sessionId"
  AND sc."personId" = sps."personId"
ON CONFLICT ("contributionId", "skillDefinitionId") DO NOTHING;

-- ============================================================================
-- 6b. Drop views that depend on columns we're about to modify
-- ============================================================================

DROP VIEW IF EXISTS v_person_work_history;

-- ============================================================================
-- 7. Modify SetCreditRaw: add roleDefinitionId, backfill, drop role
-- ============================================================================

ALTER TABLE "SetCreditRaw" ADD COLUMN "roleDefinitionId" TEXT;

UPDATE "SetCreditRaw"
SET "roleDefinitionId" = CASE role
  WHEN 'MODEL' THEN 'crd_model'
  WHEN 'PHOTOGRAPHER' THEN 'crd_photographer'
END;

ALTER TABLE "SetCreditRaw" ADD CONSTRAINT "SetCreditRaw_roleDefinitionId_fkey"
  FOREIGN KEY ("roleDefinitionId") REFERENCES "ContributionRoleDefinition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SetCreditRaw_roleDefinitionId_idx" ON "SetCreditRaw"("roleDefinitionId");

ALTER TABLE "SetCreditRaw" DROP COLUMN "role";

-- ============================================================================
-- 8. Modify SetParticipant: add roleDefinitionId, backfill, rebuild PK
-- ============================================================================

-- Drop old PK
ALTER TABLE "SetParticipant" DROP CONSTRAINT "SetParticipant_pkey";

-- Add new column
ALTER TABLE "SetParticipant" ADD COLUMN "roleDefinitionId" TEXT;

-- Backfill
UPDATE "SetParticipant"
SET "roleDefinitionId" = CASE role
  WHEN 'MODEL' THEN 'crd_model'
  WHEN 'PHOTOGRAPHER' THEN 'crd_photographer'
END;

-- Make NOT NULL
ALTER TABLE "SetParticipant" ALTER COLUMN "roleDefinitionId" SET NOT NULL;

-- Drop old column
ALTER TABLE "SetParticipant" DROP COLUMN "role";

-- Rebuild PK
ALTER TABLE "SetParticipant" ADD CONSTRAINT "SetParticipant_pkey" PRIMARY KEY ("setId", "personId", "roleDefinitionId");
CREATE INDEX "SetParticipant_roleDefinitionId_idx" ON "SetParticipant"("roleDefinitionId");

ALTER TABLE "SetParticipant" ADD CONSTRAINT "SetParticipant_roleDefinitionId_fkey"
  FOREIGN KEY ("roleDefinitionId") REFERENCES "ContributionRoleDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 9. Drop old tables and enum
-- ============================================================================

DROP TABLE "SessionParticipantSkill";
DROP TABLE "SessionParticipant";
DROP TYPE "ParticipantRole";

-- ============================================================================
-- 10. Recreate SQL views
-- ============================================================================

CREATE VIEW v_person_work_history AS
SELECT
  sp."personId",
  s.id AS "setId",
  s.title AS "setTitle",
  s.type AS "setType",
  crd.name AS role,
  s."releaseDate",
  s."releaseDatePrecision",
  ch.name AS "channelName",
  l.id AS "labelId",
  l.name AS "labelName",
  compute_age_at(p.birthdate, p."birthdatePrecision"::text, s."releaseDate", s."releaseDatePrecision"::text) AS "ageAtRelease"
FROM "SetParticipant" sp
  JOIN "ContributionRoleDefinition" crd ON crd.id = sp."roleDefinitionId"
  JOIN "Set" s ON s.id = sp."setId"
  JOIN "Person" p ON p.id = sp."personId"
  LEFT JOIN "Channel" ch ON ch.id = s."channelId"
  LEFT JOIN "ChannelLabelMap" clm ON clm."channelId" = ch.id
  LEFT JOIN "Label" l ON l.id = clm."labelId";
