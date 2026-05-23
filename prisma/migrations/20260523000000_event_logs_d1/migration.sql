-- Phase D1 — event logs for digital identities + interests; data-migrate the
-- validFrom/validTo interval columns into event pairs (added/started/ACQUIRED
-- and removed/ended/RETIRED) across all four interval-using models (ADR-0002).
-- Additive only: the validFrom/validTo columns are kept until Phase D3.

-- ─── New enums ───────────────────────────────────────────────────────────────

CREATE TYPE "DigitalIdentityEventType" AS ENUM ('added', 'modified', 'removed');
CREATE TYPE "InterestEventType" AS ENUM ('added', 'modified', 'removed');

-- ─── DigitalIdentityEvent ───────────────────────────────────────────────────

CREATE TABLE "DigitalIdentityEvent" (
  "id"                TEXT NOT NULL,
  "digitalIdentityId" TEXT NOT NULL,
  "personaId"         TEXT NOT NULL,
  "eventType"         "DigitalIdentityEventType" NOT NULL,
  "notes"             TEXT,
  "date"              TIMESTAMP(3),
  "datePrecision"     "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
  "dateModifier"      "DateModifier"  NOT NULL DEFAULT 'EXACT',
  "platform"          TEXT,
  "handle"            TEXT,
  "url"               TEXT,
  CONSTRAINT "DigitalIdentityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DigitalIdentityEvent_digitalIdentityId_idx" ON "DigitalIdentityEvent" ("digitalIdentityId");
CREATE INDEX "DigitalIdentityEvent_personaId_idx"        ON "DigitalIdentityEvent" ("personaId");
CREATE INDEX "DigitalIdentityEvent_date_idx"             ON "DigitalIdentityEvent" ("date");

ALTER TABLE "DigitalIdentityEvent" ADD CONSTRAINT "DigitalIdentityEvent_digitalIdentityId_fkey"
  FOREIGN KEY ("digitalIdentityId") REFERENCES "PersonDigitalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalIdentityEvent" ADD CONSTRAINT "DigitalIdentityEvent_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── InterestEvent ──────────────────────────────────────────────────────────

CREATE TABLE "InterestEvent" (
  "id"            TEXT NOT NULL,
  "interestId"    TEXT NOT NULL,
  "personaId"     TEXT NOT NULL,
  "eventType"     "InterestEventType" NOT NULL,
  "notes"         TEXT,
  "date"          TIMESTAMP(3),
  "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
  "dateModifier"  "DateModifier"  NOT NULL DEFAULT 'EXACT',
  "name"          TEXT,
  "category"      TEXT,
  "level"         TEXT,
  CONSTRAINT "InterestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterestEvent_interestId_idx" ON "InterestEvent" ("interestId");
CREATE INDEX "InterestEvent_personaId_idx"  ON "InterestEvent" ("personaId");
CREATE INDEX "InterestEvent_date_idx"       ON "InterestEvent" ("date");

ALTER TABLE "InterestEvent" ADD CONSTRAINT "InterestEvent_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "PersonInterest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterestEvent" ADD CONSTRAINT "InterestEvent_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Data migration: validFrom/validTo → events ─────────────────────────────
-- Era resolution: parent.eraId if set, else the person's baseline era. Every
-- person has a baseline era (invariant enforced in Phase C1).

-- Digital identity intervals → events
INSERT INTO "DigitalIdentityEvent" ("id","digitalIdentityId","personaId","eventType","date","datePrecision","dateModifier")
SELECT gen_random_uuid()::text, di.id,
  COALESCE(di."personaId", (SELECT e.id FROM "Persona" e WHERE e."personId" = di."personId" AND e."isBaseline" LIMIT 1)),
  'added'::"DigitalIdentityEventType",
  di."validFrom", di."validFromPrecision", 'EXACT'::"DateModifier"
FROM "PersonDigitalIdentity" di
WHERE di."validFrom" IS NOT NULL;

INSERT INTO "DigitalIdentityEvent" ("id","digitalIdentityId","personaId","eventType","date","datePrecision","dateModifier")
SELECT gen_random_uuid()::text, di.id,
  COALESCE(di."personaId", (SELECT e.id FROM "Persona" e WHERE e."personId" = di."personId" AND e."isBaseline" LIMIT 1)),
  'removed'::"DigitalIdentityEventType",
  di."validTo", di."validToPrecision", 'EXACT'::"DateModifier"
FROM "PersonDigitalIdentity" di
WHERE di."validTo" IS NOT NULL;

-- Interest intervals → events (interest has no parent eraId; always use baseline)
INSERT INTO "InterestEvent" ("id","interestId","personaId","eventType","date","datePrecision","dateModifier")
SELECT gen_random_uuid()::text, pi.id,
  (SELECT e.id FROM "Persona" e WHERE e."personId" = pi."personId" AND e."isBaseline" LIMIT 1),
  'added'::"InterestEventType",
  pi."validFrom", pi."validFromPrecision", 'EXACT'::"DateModifier"
FROM "PersonInterest" pi
WHERE pi."validFrom" IS NOT NULL;

INSERT INTO "InterestEvent" ("id","interestId","personaId","eventType","date","datePrecision","dateModifier")
SELECT gen_random_uuid()::text, pi.id,
  (SELECT e.id FROM "Persona" e WHERE e."personId" = pi."personId" AND e."isBaseline" LIMIT 1),
  'removed'::"InterestEventType",
  pi."validTo", pi."validToPrecision", 'EXACT'::"DateModifier"
FROM "PersonInterest" pi
WHERE pi."validTo" IS NOT NULL;

-- Skill validFrom → ACQUIRED, validTo → RETIRED — only where not already represented
INSERT INTO "PersonSkillEvent" ("id","personSkillId","personaId","eventType","date","datePrecision")
SELECT gen_random_uuid()::text, ps.id, ps."personaId",
  'ACQUIRED'::"SkillEventType",
  ps."validFrom", ps."validFromPrecision"
FROM "PersonSkill" ps
WHERE ps."validFrom" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "PersonSkillEvent" pse WHERE pse."personSkillId" = ps.id AND pse."eventType" = 'ACQUIRED');

INSERT INTO "PersonSkillEvent" ("id","personSkillId","personaId","eventType","date","datePrecision")
SELECT gen_random_uuid()::text, ps.id, ps."personaId",
  'RETIRED'::"SkillEventType",
  ps."validTo", ps."validToPrecision"
FROM "PersonSkill" ps
WHERE ps."validTo" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "PersonSkillEvent" pse WHERE pse."personSkillId" = ps.id AND pse."eventType" = 'RETIRED');

-- Relationship validFrom → started, validTo → ended — only where not already represented
INSERT INTO "RelationshipEvent" ("id","relationshipId","eventType","date","datePrecision")
SELECT gen_random_uuid()::text, pr.id,
  'started'::"RelationshipEventType",
  pr."validFrom", pr."validFromPrecision"
FROM "PersonRelationship" pr
WHERE pr."validFrom" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "RelationshipEvent" re WHERE re."relationshipId" = pr.id AND re."eventType" = 'started');

INSERT INTO "RelationshipEvent" ("id","relationshipId","eventType","date","datePrecision")
SELECT gen_random_uuid()::text, pr.id,
  'ended'::"RelationshipEventType",
  pr."validTo", pr."validToPrecision"
FROM "PersonRelationship" pr
WHERE pr."validTo" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "RelationshipEvent" re WHERE re."relationshipId" = pr.id AND re."eventType" = 'ended');
