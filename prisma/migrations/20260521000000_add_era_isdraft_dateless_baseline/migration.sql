-- Phase A — temporal-model migration.
-- The `Persona` model is renamed to `Era` at the Prisma level only: the model
-- keeps `@@map("Persona")` and every FK keeps `@map("personaId")`, so the DB
-- table and columns are unchanged — no rename SQL is needed here.

-- 1. New: Era.isDraft — flags an un-named / unreviewed (e.g. import-created) Era.
ALTER TABLE "Persona" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- 2. The baseline Era is now dateless ("time zero"). Clear the synthetic
--    baseline dates (formerly birthdate + 18 years). The fold orders the
--    baseline first via `isBaseline`, so no date is needed. See ADR-0001.
UPDATE "Persona"
SET "date" = NULL, "datePrecision" = 'UNKNOWN'::"DatePrecision"
WHERE "isBaseline" = true;
