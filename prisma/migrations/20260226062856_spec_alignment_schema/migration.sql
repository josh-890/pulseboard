/*
  Spec alignment: remove Set.sessionId, Channel.labelId, SetContribution model/enum.
  Rename LabelNetwork → LabelNetworkLink (via @@map, no table rename needed).
  Rename SetCreditRaw.rawNameNorm → nameNorm (via @map, no column rename needed).
  Views that depend on removed columns are dropped and recreated.
*/

-- ─── Drop dependent views/materialized views ────────────────────────────────

DROP VIEW IF EXISTS v_person_work_history CASCADE;
DROP VIEW IF EXISTS v_person_list CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_person_affiliations CASCADE;

-- ─── Drop foreign keys ──────────────────────────────────────────────────────

ALTER TABLE "Channel" DROP CONSTRAINT IF EXISTS "Channel_labelId_fkey";
ALTER TABLE "Set" DROP CONSTRAINT IF EXISTS "Set_sessionId_fkey";
ALTER TABLE "SetContribution" DROP CONSTRAINT IF EXISTS "SetContribution_personId_fkey";
ALTER TABLE "SetContribution" DROP CONSTRAINT IF EXISTS "SetContribution_setId_fkey";

-- ─── Drop indexes ───────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "Channel_labelId_idx";
DROP INDEX IF EXISTS "Set_sessionId_idx";

-- ─── Alter tables ───────────────────────────────────────────────────────────

ALTER TABLE "Channel" DROP COLUMN "labelId";
ALTER TABLE "Set" DROP COLUMN "sessionId";

-- ─── Drop SetContribution table and ContributionRole enum ───────────────────

DROP TABLE "SetContribution";
DROP TYPE "ContributionRole";

-- ─── Recreate views using SetParticipant + ChannelLabelMap ──────────────────

-- v_person_list: setCount now comes from SetParticipant
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
  (SELECT COUNT(DISTINCT sp."setId") FROM "SetParticipant" sp
   JOIN "Set" s ON s.id = sp."setId" AND s."deletedAt" IS NULL
   WHERE sp."personId" = p.id)::INT AS "setCount"
FROM "Person" p WHERE p."deletedAt" IS NULL;

-- v_person_work_history: joins through SetParticipant, label via ChannelLabelMap
CREATE VIEW v_person_work_history AS
SELECT
  sp."personId", s.id AS "setId", s.title AS "setTitle", s.type AS "setType",
  sp.role::TEXT AS role,
  s."releaseDate", s."releaseDatePrecision",
  ch.name AS "channelName", l.id AS "labelId", l.name AS "labelName",
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT,
    s."releaseDate", s."releaseDatePrecision"::TEXT) AS "ageAtRelease"
FROM "SetParticipant" sp
JOIN "Set" s ON s.id = sp."setId" AND s."deletedAt" IS NULL
JOIN "Person" p ON p.id = sp."personId" AND p."deletedAt" IS NULL
LEFT JOIN "Channel" ch ON ch.id = s."channelId" AND ch."deletedAt" IS NULL
LEFT JOIN "ChannelLabelMap" clm ON clm."channelId" = ch.id
LEFT JOIN "Label" l ON l.id = clm."labelId" AND l."deletedAt" IS NULL;

-- mv_person_affiliations: now via SetParticipant + ChannelLabelMap
CREATE MATERIALIZED VIEW mv_person_affiliations AS
SELECT sp."personId", l.id AS "labelId", l.name AS "labelName",
  COUNT(DISTINCT s.id)::INT AS "setCount"
FROM "SetParticipant" sp
JOIN "Set" s ON s.id = sp."setId" AND s."deletedAt" IS NULL
JOIN "Channel" ch ON ch.id = s."channelId" AND ch."deletedAt" IS NULL
JOIN "ChannelLabelMap" clm ON clm."channelId" = ch.id
JOIN "Label" l ON l.id = clm."labelId" AND l."deletedAt" IS NULL
GROUP BY sp."personId", l.id, l.name;

CREATE UNIQUE INDEX ON mv_person_affiliations ("personId", "labelId");
