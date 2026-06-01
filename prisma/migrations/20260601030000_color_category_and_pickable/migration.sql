-- Slice 16E — color-attribute consolidation (per ADR-0010).
--
-- Two additive schema changes:
--   1. PhysicalAttributeDefinition.colorCategory — annotates which catalog
--      entries are backed by color_catalog. Lets TypedAttributeInput
--      route to ColorValueCombobox without slug-checks in 5+ parent
--      components.
--   2. ColorCatalog.pickable — gates which entries appear in the picker's
--      dropdown. Lets the admin curate a working subset while keeping
--      the full vocabulary (synonyms with identical hue/shade for data
--      preservation).
--
-- Neither column is destructive. Backfill is deterministic (3 slugs map
-- to 3 categories; every existing color_catalog row defaults to
-- pickable=true). Rolling back is `DROP COLUMN` on both + `DROP TYPE`
-- on the enum.

-- ─── ColorCategory enum ────────────────────────────────────────────────

CREATE TYPE "ColorCategory" AS ENUM ('hair', 'eye', 'skin');

-- ─── PhysicalAttributeDefinition.colorCategory ─────────────────────────

ALTER TABLE "PhysicalAttributeDefinition"
  ADD COLUMN "colorCategory" "ColorCategory";

UPDATE "PhysicalAttributeDefinition" SET "colorCategory" = 'hair' WHERE slug = 'hair_color';
UPDATE "PhysicalAttributeDefinition" SET "colorCategory" = 'eye'  WHERE slug = 'eye-color';
UPDATE "PhysicalAttributeDefinition" SET "colorCategory" = 'skin' WHERE slug = 'skin-tone';

-- ─── ColorCatalog.pickable ─────────────────────────────────────────────

ALTER TABLE "color_catalog"
  ADD COLUMN "pickable" BOOLEAN NOT NULL DEFAULT true;
