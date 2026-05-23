-- Phase D3 — drop the legacy validFrom/validTo interval columns from the four
-- interval-using models. Their values were migrated to event logs in Phase D1;
-- services read/write via the events (ADR-0002).

ALTER TABLE "PersonDigitalIdentity"
  DROP COLUMN "validFrom",
  DROP COLUMN "validFromPrecision",
  DROP COLUMN "validTo",
  DROP COLUMN "validToPrecision";

ALTER TABLE "PersonInterest"
  DROP COLUMN "validFrom",
  DROP COLUMN "validFromPrecision",
  DROP COLUMN "validTo",
  DROP COLUMN "validToPrecision";

ALTER TABLE "PersonSkill"
  DROP COLUMN "validFrom",
  DROP COLUMN "validFromPrecision",
  DROP COLUMN "validTo",
  DROP COLUMN "validToPrecision";

ALTER TABLE "PersonRelationship"
  DROP COLUMN "validFrom",
  DROP COLUMN "validFromPrecision",
  DROP COLUMN "validTo",
  DROP COLUMN "validToPrecision";
