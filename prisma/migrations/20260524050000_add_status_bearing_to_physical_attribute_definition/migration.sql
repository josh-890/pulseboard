-- Slice 6½ of Phase G (ADR-0007 amendment, 2026-05-24): per-definition
-- statusBearing flag gates AttributeStatus UI surfaces.
-- See project_status_bearing_eligibility.md for the full rationale.

ALTER TABLE "PhysicalAttributeDefinition"
  ADD COLUMN "statusBearing" BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: in the user's domain the only status-eligible attribute is
-- breast_size (the only cosmetic procedure they track is breast augmentation).
-- Other attrs can be opted in later via the catalog manager UI.
UPDATE "PhysicalAttributeDefinition"
   SET "statusBearing" = TRUE
 WHERE slug = 'breast_size';
