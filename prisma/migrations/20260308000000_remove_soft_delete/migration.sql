-- Remove Soft Delete: Hard-delete soft-deleted rows, drop deletedAt columns, recreate views/MVs
-- This migration is manually written (not auto-generated) because it includes view/MV recreation.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Hard-delete all currently soft-deleted rows (children before parents for FK)
-- ══════════════════════════════════════════════════════════════════════════════

-- Skill event media (join table referencing PersonSkillEvent)
DELETE FROM "SkillEventMedia" WHERE "skillEventId" IN (
  SELECT id FROM "PersonSkillEvent" WHERE "deletedAt" IS NOT NULL
);

-- PersonSkillEvent
DELETE FROM "PersonSkillEvent" WHERE "deletedAt" IS NOT NULL;

-- PersonSkill
DELETE FROM "PersonSkill" WHERE "deletedAt" IS NOT NULL;

-- BodyMarkEvent
DELETE FROM "BodyMarkEvent" WHERE "deletedAt" IS NOT NULL;

-- BodyModificationEvent
DELETE FROM "BodyModificationEvent" WHERE "deletedAt" IS NOT NULL;

-- CosmeticProcedureEvent
DELETE FROM "CosmeticProcedureEvent" WHERE "deletedAt" IS NOT NULL;

-- RelationshipEvent
DELETE FROM "RelationshipEvent" WHERE "deletedAt" IS NOT NULL;

-- PersonDigitalIdentity
DELETE FROM "PersonDigitalIdentity" WHERE "deletedAt" IS NOT NULL;

-- PersonEducation
DELETE FROM "PersonEducation" WHERE "deletedAt" IS NOT NULL;

-- PersonAward
DELETE FROM "PersonAward" WHERE "deletedAt" IS NOT NULL;

-- PersonInterest
DELETE FROM "PersonInterest" WHERE "deletedAt" IS NOT NULL;

-- PersonMediaLink
DELETE FROM "PersonMediaLink" WHERE "deletedAt" IS NOT NULL;

-- SetCreditRaw
DELETE FROM "SetCreditRaw" WHERE "deletedAt" IS NOT NULL;

-- MediaCollectionItem (join table referencing MediaCollection)
DELETE FROM "MediaCollectionItem" WHERE "collectionId" IN (
  SELECT id FROM "MediaCollection" WHERE "deletedAt" IS NOT NULL
);

-- MediaCollection
DELETE FROM "MediaCollection" WHERE "deletedAt" IS NOT NULL;

-- PersonMediaLink referencing soft-deleted MediaItems (non-soft-deleted links to soft-deleted media)
DELETE FROM "PersonMediaLink" WHERE "mediaItemId" IN (
  SELECT id FROM "MediaItem" WHERE "deletedAt" IS NOT NULL
);

-- SetMediaItem (join table referencing MediaItem)
DELETE FROM "SetMediaItem" WHERE "mediaItemId" IN (
  SELECT id FROM "MediaItem" WHERE "deletedAt" IS NOT NULL
);

-- SkillEventMedia (join table referencing MediaItem)
DELETE FROM "SkillEventMedia" WHERE "mediaItemId" IN (
  SELECT id FROM "MediaItem" WHERE "deletedAt" IS NOT NULL
);

-- MediaCollectionItem (join table referencing MediaItem)
DELETE FROM "MediaCollectionItem" WHERE "mediaItemId" IN (
  SELECT id FROM "MediaItem" WHERE "deletedAt" IS NOT NULL
);

-- Clear cover references before deleting media items
UPDATE "Set" SET "coverMediaItemId" = NULL WHERE "coverMediaItemId" IN (
  SELECT id FROM "MediaItem" WHERE "deletedAt" IS NOT NULL
);

-- MediaItem
DELETE FROM "MediaItem" WHERE "deletedAt" IS NOT NULL;

-- BodyMarkEvent referencing soft-deleted BodyMarks
DELETE FROM "BodyMarkEvent" WHERE "bodyMarkId" IN (
  SELECT id FROM "BodyMark" WHERE "deletedAt" IS NOT NULL
);

-- PersonMediaLink referencing soft-deleted BodyMark/BodyModification/CosmeticProcedure
DELETE FROM "PersonMediaLink" WHERE "bodyMarkId" IN (
  SELECT id FROM "BodyMark" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "PersonMediaLink" WHERE "bodyModificationId" IN (
  SELECT id FROM "BodyModification" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "PersonMediaLink" WHERE "cosmeticProcedureId" IN (
  SELECT id FROM "CosmeticProcedure" WHERE "deletedAt" IS NOT NULL
);

-- BodyMark
DELETE FROM "BodyMark" WHERE "deletedAt" IS NOT NULL;

-- BodyModificationEvent referencing soft-deleted BodyModifications
DELETE FROM "BodyModificationEvent" WHERE "bodyModificationId" IN (
  SELECT id FROM "BodyModification" WHERE "deletedAt" IS NOT NULL
);

-- BodyModification
DELETE FROM "BodyModification" WHERE "deletedAt" IS NOT NULL;

-- CosmeticProcedureEvent referencing soft-deleted CosmeticProcedures
DELETE FROM "CosmeticProcedureEvent" WHERE "cosmeticProcedureId" IN (
  SELECT id FROM "CosmeticProcedure" WHERE "deletedAt" IS NOT NULL
);

-- CosmeticProcedure
DELETE FROM "CosmeticProcedure" WHERE "deletedAt" IS NOT NULL;

-- Persona (delete PersonaPhysical first)
DELETE FROM "PersonaPhysical" WHERE "personaId" IN (
  SELECT id FROM "Persona" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "Persona" WHERE "deletedAt" IS NOT NULL;

-- PersonRelationship
DELETE FROM "PersonRelationship" WHERE "deletedAt" IS NOT NULL;

-- PersonAlias
DELETE FROM "PersonAlias" WHERE "deletedAt" IS NOT NULL;

-- Activity
DELETE FROM "Activity" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Sessions
DELETE FROM "SessionParticipant" WHERE "sessionId" IN (
  SELECT id FROM "Session" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SessionParticipantSkill" WHERE "sessionId" IN (
  SELECT id FROM "Session" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SetSession" WHERE "sessionId" IN (
  SELECT id FROM "Session" WHERE "deletedAt" IS NOT NULL
);

-- Session
DELETE FROM "Session" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Sets
DELETE FROM "SetMediaItem" WHERE "setId" IN (
  SELECT id FROM "Set" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SetParticipant" WHERE "setId" IN (
  SELECT id FROM "Set" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SetLabelEvidence" WHERE "setId" IN (
  SELECT id FROM "Set" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SetSession" WHERE "setId" IN (
  SELECT id FROM "Set" WHERE "deletedAt" IS NOT NULL
);

-- Set
DELETE FROM "Set" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Channels
UPDATE "Set" SET "channelId" = NULL WHERE "channelId" IN (
  SELECT id FROM "Channel" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "ChannelLabelMap" WHERE "channelId" IN (
  SELECT id FROM "Channel" WHERE "deletedAt" IS NOT NULL
);

-- Channel
DELETE FROM "Channel" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Projects
UPDATE "Session" SET "projectId" = NULL WHERE "projectId" IN (
  SELECT id FROM "Project" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "ProjectLabel" WHERE "projectId" IN (
  SELECT id FROM "Project" WHERE "deletedAt" IS NOT NULL
);

-- Project
DELETE FROM "Project" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Labels
DELETE FROM "ProjectLabel" WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "ChannelLabelMap" WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "SetLabelEvidence" WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);
UPDATE "Session" SET "labelId" = NULL WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);
UPDATE "Project" SET "labelId" = NULL WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);
DELETE FROM "LabelNetwork" WHERE "labelId" IN (
  SELECT id FROM "Label" WHERE "deletedAt" IS NOT NULL
);

-- Label
DELETE FROM "Label" WHERE "deletedAt" IS NOT NULL;

-- Clean up children of soft-deleted Networks
DELETE FROM "LabelNetwork" WHERE "networkId" IN (
  SELECT id FROM "Network" WHERE "deletedAt" IS NOT NULL
);

-- Network
DELETE FROM "Network" WHERE "deletedAt" IS NOT NULL;

-- Clean up ALL children of soft-deleted Persons
-- SkillEventMedia for PersonSkillEvents of PersonSkills of soft-deleted Persons
DELETE FROM "SkillEventMedia" WHERE "skillEventId" IN (
  SELECT pse.id FROM "PersonSkillEvent" pse
    JOIN "PersonSkill" ps ON ps.id = pse."personSkillId"
    WHERE ps."personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonSkillEvent" WHERE "personSkillId" IN (
  SELECT id FROM "PersonSkill" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonSkill" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "SessionParticipantSkill" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "SessionParticipant" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "SetParticipant" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- BodyMarkEvent for BodyMarks of soft-deleted Persons
DELETE FROM "BodyMarkEvent" WHERE "bodyMarkId" IN (
  SELECT id FROM "BodyMark" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonMediaLink" WHERE "bodyMarkId" IN (
  SELECT id FROM "BodyMark" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "BodyMark" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- BodyModificationEvent for BodyModifications of soft-deleted Persons
DELETE FROM "BodyModificationEvent" WHERE "bodyModificationId" IN (
  SELECT id FROM "BodyModification" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonMediaLink" WHERE "bodyModificationId" IN (
  SELECT id FROM "BodyModification" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "BodyModification" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- CosmeticProcedureEvent for CosmeticProcedures of soft-deleted Persons
DELETE FROM "CosmeticProcedureEvent" WHERE "cosmeticProcedureId" IN (
  SELECT id FROM "CosmeticProcedure" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonMediaLink" WHERE "cosmeticProcedureId" IN (
  SELECT id FROM "CosmeticProcedure" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "CosmeticProcedure" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- PersonaPhysical + Persona children
DELETE FROM "PersonaPhysical" WHERE "personaId" IN (
  SELECT id FROM "Persona" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "Persona" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- Remaining Person children
DELETE FROM "PersonAlias" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "PersonDigitalIdentity" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "PersonEducation" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "PersonAward" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "PersonInterest" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "PersonMediaLink" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);
DELETE FROM "SetCreditRaw" WHERE "resolvedPersonId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- Relationships
DELETE FROM "RelationshipEvent" WHERE "relationshipId" IN (
  SELECT id FROM "PersonRelationship" WHERE "personAId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
    OR "personBId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "PersonRelationship" WHERE "personAId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
  OR "personBId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- MediaCollections
DELETE FROM "MediaCollectionItem" WHERE "collectionId" IN (
  SELECT id FROM "MediaCollection" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL)
);
DELETE FROM "MediaCollection" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- Reference sessions
DELETE FROM "Session" WHERE "personId" IN (SELECT id FROM "Person" WHERE "deletedAt" IS NOT NULL);

-- Person
DELETE FROM "Person" WHERE "deletedAt" IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Drop views & materialized views that reference deletedAt
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS v_person_body_events;
DROP VIEW IF EXISTS v_person_work_history;
DROP VIEW IF EXISTS v_person_list;
DROP MATERIALIZED VIEW IF EXISTS mv_person_affiliations;
DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_stats;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Drop deletedAt columns and indexes from all tables
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop indexes first (Prisma names them <Table>_<column>_idx)
DROP INDEX IF EXISTS "Person_deletedAt_idx";
DROP INDEX IF EXISTS "PersonAlias_deletedAt_idx";
DROP INDEX IF EXISTS "Persona_deletedAt_idx";
DROP INDEX IF EXISTS "BodyMark_deletedAt_idx";
DROP INDEX IF EXISTS "BodyMarkEvent_deletedAt_idx";
DROP INDEX IF EXISTS "PersonDigitalIdentity_deletedAt_idx";
DROP INDEX IF EXISTS "PersonSkill_deletedAt_idx";
DROP INDEX IF EXISTS "PersonRelationship_deletedAt_idx";
DROP INDEX IF EXISTS "BodyModification_deletedAt_idx";
DROP INDEX IF EXISTS "BodyModificationEvent_deletedAt_idx";
DROP INDEX IF EXISTS "CosmeticProcedure_deletedAt_idx";
DROP INDEX IF EXISTS "CosmeticProcedureEvent_deletedAt_idx";
DROP INDEX IF EXISTS "PersonEducation_deletedAt_idx";
DROP INDEX IF EXISTS "PersonAward_deletedAt_idx";
DROP INDEX IF EXISTS "PersonInterest_deletedAt_idx";
DROP INDEX IF EXISTS "RelationshipEvent_deletedAt_idx";
DROP INDEX IF EXISTS "Network_deletedAt_idx";
DROP INDEX IF EXISTS "Label_deletedAt_idx";
DROP INDEX IF EXISTS "Channel_deletedAt_idx";
DROP INDEX IF EXISTS "Project_deletedAt_idx";
DROP INDEX IF EXISTS "Session_deletedAt_idx";
DROP INDEX IF EXISTS "Set_deletedAt_idx";
DROP INDEX IF EXISTS "MediaItem_deletedAt_idx";
DROP INDEX IF EXISTS "SetCreditRaw_deletedAt_idx";
DROP INDEX IF EXISTS "PersonMediaLink_deletedAt_idx";
DROP INDEX IF EXISTS "MediaCollection_deletedAt_idx";
DROP INDEX IF EXISTS "Activity_deletedAt_idx";
DROP INDEX IF EXISTS "PersonSkillEvent_deletedAt_idx";

-- Drop columns
ALTER TABLE "Person" DROP COLUMN "deletedAt";
ALTER TABLE "PersonAlias" DROP COLUMN "deletedAt";
ALTER TABLE "Persona" DROP COLUMN "deletedAt";
ALTER TABLE "BodyMark" DROP COLUMN "deletedAt";
ALTER TABLE "BodyMarkEvent" DROP COLUMN "deletedAt";
ALTER TABLE "PersonDigitalIdentity" DROP COLUMN "deletedAt";
ALTER TABLE "PersonSkill" DROP COLUMN "deletedAt";
ALTER TABLE "PersonRelationship" DROP COLUMN "deletedAt";
ALTER TABLE "BodyModification" DROP COLUMN "deletedAt";
ALTER TABLE "BodyModificationEvent" DROP COLUMN "deletedAt";
ALTER TABLE "CosmeticProcedure" DROP COLUMN "deletedAt";
ALTER TABLE "CosmeticProcedureEvent" DROP COLUMN "deletedAt";
ALTER TABLE "PersonEducation" DROP COLUMN "deletedAt";
ALTER TABLE "PersonAward" DROP COLUMN "deletedAt";
ALTER TABLE "PersonInterest" DROP COLUMN "deletedAt";
ALTER TABLE "RelationshipEvent" DROP COLUMN "deletedAt";
ALTER TABLE "Network" DROP COLUMN "deletedAt";
ALTER TABLE "Label" DROP COLUMN "deletedAt";
ALTER TABLE "Channel" DROP COLUMN "deletedAt";
ALTER TABLE "Project" DROP COLUMN "deletedAt";
ALTER TABLE "Session" DROP COLUMN "deletedAt";
ALTER TABLE "Set" DROP COLUMN "deletedAt";
ALTER TABLE "MediaItem" DROP COLUMN "deletedAt";
ALTER TABLE "SetCreditRaw" DROP COLUMN "deletedAt";
ALTER TABLE "PersonMediaLink" DROP COLUMN "deletedAt";
ALTER TABLE "MediaCollection" DROP COLUMN "deletedAt";
ALTER TABLE "Activity" DROP COLUMN "deletedAt";
ALTER TABLE "PersonSkillEvent" DROP COLUMN "deletedAt";


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Recreate views & materialized views WITHOUT deletedAt filters
-- ══════════════════════════════════════════════════════════════════════════════

-- v_person_list
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
  "activeSince",
  "retiredIn",
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
    WHEN "activeSince" IS NOT NULL AND birthdate IS NOT NULL
    THEN ("activeSince" - EXTRACT(year FROM birthdate)::integer)::text
    ELSE NULL::text
  END AS "careerStartAge",
  ((SELECT count(*) FROM "BodyMark" bm
    WHERE bm."personId" = p.id AND bm.status = 'present'::"BodyMarkStatus"))::integer AS "activeBodyMarkCount",
  ((SELECT count(DISTINCT sp."setId") FROM "SetParticipant" sp
    JOIN "Set" s ON s.id = sp."setId"
    WHERE sp."personId" = p.id))::integer AS "setCount"
FROM "Person" p;

-- v_person_work_history
CREATE VIEW v_person_work_history AS
SELECT
  sp."personId",
  s.id AS "setId",
  s.title AS "setTitle",
  s.type AS "setType",
  sp.role::text AS role,
  s."releaseDate",
  s."releaseDatePrecision",
  ch.name AS "channelName",
  l.id AS "labelId",
  l.name AS "labelName",
  compute_age_at(p.birthdate, p."birthdatePrecision"::text, s."releaseDate", s."releaseDatePrecision"::text) AS "ageAtRelease"
FROM "SetParticipant" sp
  JOIN "Set" s ON s.id = sp."setId"
  JOIN "Person" p ON p.id = sp."personId"
  LEFT JOIN "Channel" ch ON ch.id = s."channelId"
  LEFT JOIN "ChannelLabelMap" clm ON clm."channelId" = ch.id
  LEFT JOIN "Label" l ON l.id = clm."labelId";

-- v_person_body_events
CREATE VIEW v_person_body_events AS
SELECT
  p.id AS "personId",
  'body_mark'::text AS category,
  bm.type::text AS "eventType",
  bm."bodyRegion",
  bm.side,
  bm.description,
  bme."eventType"::text AS "changeType",
  per.date AS "eventDate",
  per."datePrecision"::text AS "eventDatePrecision",
  compute_age_at(p.birthdate, p."birthdatePrecision"::text, per.date, per."datePrecision"::text) AS "ageAtEvent",
  bm.id AS "sourceId",
  bme.id AS "eventId"
FROM "BodyMarkEvent" bme
  JOIN "BodyMark" bm ON bm.id = bme."bodyMarkId"
  JOIN "Persona" per ON per.id = bme."personaId"
  JOIN "Person" p ON p.id = bm."personId"
UNION ALL
SELECT
  p.id AS "personId",
  'body_modification'::text AS category,
  bmod.type::text AS "eventType",
  bmod."bodyRegion",
  bmod.side,
  bmod.description,
  bmode."eventType"::text AS "changeType",
  per.date AS "eventDate",
  per."datePrecision"::text AS "eventDatePrecision",
  compute_age_at(p.birthdate, p."birthdatePrecision"::text, per.date, per."datePrecision"::text) AS "ageAtEvent",
  bmod.id AS "sourceId",
  bmode.id AS "eventId"
FROM "BodyModificationEvent" bmode
  JOIN "BodyModification" bmod ON bmod.id = bmode."bodyModificationId"
  JOIN "Persona" per ON per.id = bmode."personaId"
  JOIN "Person" p ON p.id = bmod."personId"
UNION ALL
SELECT
  p.id AS "personId",
  'cosmetic_procedure'::text AS category,
  cp.type AS "eventType",
  cp."bodyRegion",
  NULL::text AS side,
  cp.description,
  cpe."eventType"::text AS "changeType",
  per.date AS "eventDate",
  per."datePrecision"::text AS "eventDatePrecision",
  compute_age_at(p.birthdate, p."birthdatePrecision"::text, per.date, per."datePrecision"::text) AS "ageAtEvent",
  cp.id AS "sourceId",
  cpe.id AS "eventId"
FROM "CosmeticProcedureEvent" cpe
  JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId"
  JOIN "Persona" per ON per.id = cpe."personaId"
  JOIN "Person" p ON p.id = cp."personId";

-- mv_dashboard_stats
CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
  (SELECT count(*) FROM "Person") AS "personCount",
  (SELECT count(*) FROM "Set") AS "setCount",
  (SELECT count(*) FROM "Label") AS "labelCount",
  (SELECT count(*) FROM "Channel") AS "channelCount",
  (SELECT count(*) FROM "Project") AS "projectCount",
  (SELECT count(*) FROM "MediaItem") AS "mediaItemCount",
  (SELECT count(*) FROM "Session" WHERE "Session".type <> 'REFERENCE'::"SessionType") AS "sessionCount";

-- mv_person_current_state
CREATE MATERIALIZED VIEW mv_person_current_state AS
WITH ordered AS (
  SELECT
    per."personId",
    pp."currentHairColor",
    pp.weight,
    pp.build,
    pp."visionAids",
    pp."fitnessLevel",
    row_number() OVER (PARTITION BY per."personId" ORDER BY per."isBaseline" DESC, per.date NULLS FIRST) AS rn
  FROM "Persona" per
    JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
), folded AS (
  SELECT
    ordered."personId",
    max(ordered."currentHairColor") FILTER (WHERE ordered."currentHairColor" IS NOT NULL) OVER w AS "currentHairColor",
    max(ordered.weight) FILTER (WHERE ordered.weight IS NOT NULL) OVER w AS "currentWeight",
    max(ordered.build) FILTER (WHERE ordered.build IS NOT NULL) OVER w AS "currentBuild",
    max(ordered."visionAids") FILTER (WHERE ordered."visionAids" IS NOT NULL) OVER w AS "currentVisionAids",
    max(ordered."fitnessLevel") FILTER (WHERE ordered."fitnessLevel" IS NOT NULL) OVER w AS "currentFitnessLevel",
    ordered.rn,
    max(ordered.rn) OVER (PARTITION BY ordered."personId") AS max_rn
  FROM ordered
  WINDOW w AS (PARTITION BY ordered."personId" ORDER BY ordered.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT "personId", "currentHairColor", "currentWeight", "currentBuild", "currentVisionAids", "currentFitnessLevel"
FROM folded
WHERE rn = max_rn;

CREATE UNIQUE INDEX ON mv_person_current_state ("personId");

-- mv_person_affiliations
CREATE MATERIALIZED VIEW mv_person_affiliations AS
SELECT
  sp."personId",
  l.id AS "labelId",
  l.name AS "labelName",
  count(DISTINCT s.id)::integer AS "setCount"
FROM "SetParticipant" sp
  JOIN "Set" s ON s.id = sp."setId"
  JOIN "Channel" ch ON ch.id = s."channelId"
  JOIN "ChannelLabelMap" clm ON clm."channelId" = ch.id
  JOIN "Label" l ON l.id = clm."labelId"
GROUP BY sp."personId", l.id, l.name;

CREATE UNIQUE INDEX ON mv_person_affiliations ("personId", "labelId");
