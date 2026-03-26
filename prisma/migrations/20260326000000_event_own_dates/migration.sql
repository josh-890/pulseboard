-- AlterTable: Add date fields to BodyMarkEvent
ALTER TABLE "BodyMarkEvent" ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT';

-- AlterTable: Add date fields to BodyModificationEvent
ALTER TABLE "BodyModificationEvent" ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT';

-- AlterTable: Add date fields to CosmeticProcedureEvent
ALTER TABLE "CosmeticProcedureEvent" ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT';

-- AlterTable: Add date fields to PersonaPhysical
ALTER TABLE "PersonaPhysical" ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "dateModifier" "DateModifier" NOT NULL DEFAULT 'EXACT';

-- Backfill: copy persona dates to events
UPDATE "BodyMarkEvent" e SET date=p.date, "datePrecision"=p."datePrecision", "dateModifier"=p."dateModifier" FROM "Persona" p WHERE p.id=e."personaId";
UPDATE "BodyModificationEvent" e SET date=p.date, "datePrecision"=p."datePrecision", "dateModifier"=p."dateModifier" FROM "Persona" p WHERE p.id=e."personaId";
UPDATE "CosmeticProcedureEvent" e SET date=p.date, "datePrecision"=p."datePrecision", "dateModifier"=p."dateModifier" FROM "Persona" p WHERE p.id=e."personaId";
UPDATE "PersonaPhysical" e SET date=p.date, "datePrecision"=p."datePrecision", "dateModifier"=p."dateModifier" FROM "Persona" p WHERE p.id=e."personaId";

-- Indexes for ordering
CREATE INDEX "BodyMarkEvent_date_idx" ON "BodyMarkEvent"(date);
CREATE INDEX "BodyModificationEvent_date_idx" ON "BodyModificationEvent"(date);
CREATE INDEX "CosmeticProcedureEvent_date_idx" ON "CosmeticProcedureEvent"(date);
CREATE INDEX "PersonaPhysical_date_idx" ON "PersonaPhysical"(date);

-- Recreate v_person_body_events to use event dates
DROP VIEW IF EXISTS v_person_body_events;
CREATE VIEW v_person_body_events AS
-- Body marks
SELECT p.id AS "personId", 'body_mark' AS "category", bm.type::TEXT AS "eventType",
  bm."bodyRegion", bm.side, bm.description, bme."eventType"::TEXT AS "changeType",
  COALESCE(bme.date, per.date) AS "eventDate",
  COALESCE(bme."datePrecision"::TEXT, per."datePrecision"::TEXT) AS "eventDatePrecision",
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT,
    COALESCE(bme.date, per.date), COALESCE(bme."datePrecision"::TEXT, per."datePrecision"::TEXT)) AS "ageAtEvent",
  bm.id AS "sourceId", bme.id AS "eventId"
FROM "BodyMarkEvent" bme
JOIN "BodyMark" bm ON bm.id = bme."bodyMarkId"
JOIN "Persona" per ON per.id = bme."personaId"
JOIN "Person" p ON p.id = bm."personId"
UNION ALL
-- Body modifications
SELECT p.id, 'body_modification', bmod.type::TEXT,
  bmod."bodyRegion", bmod.side, bmod.description, bmode."eventType"::TEXT,
  COALESCE(bmode.date, per.date),
  COALESCE(bmode."datePrecision"::TEXT, per."datePrecision"::TEXT),
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT,
    COALESCE(bmode.date, per.date), COALESCE(bmode."datePrecision"::TEXT, per."datePrecision"::TEXT)),
  bmod.id, bmode.id
FROM "BodyModificationEvent" bmode
JOIN "BodyModification" bmod ON bmod.id = bmode."bodyModificationId"
JOIN "Persona" per ON per.id = bmode."personaId"
JOIN "Person" p ON p.id = bmod."personId"
UNION ALL
-- Cosmetic procedures
SELECT p.id, 'cosmetic_procedure', cp.type,
  cp."bodyRegion", NULL, cp.description, cpe."eventType"::TEXT,
  COALESCE(cpe.date, per.date),
  COALESCE(cpe."datePrecision"::TEXT, per."datePrecision"::TEXT),
  compute_age_at(p.birthdate, p."birthdatePrecision"::TEXT,
    COALESCE(cpe.date, per.date), COALESCE(cpe."datePrecision"::TEXT, per."datePrecision"::TEXT)),
  cp.id, cpe.id
FROM "CosmeticProcedureEvent" cpe
JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId"
JOIN "Persona" per ON per.id = cpe."personaId"
JOIN "Person" p ON p.id = cp."personId";
