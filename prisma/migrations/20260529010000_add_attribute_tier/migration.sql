-- Slice 16 follow-up: add AuditTier enum + tier column to
-- PhysicalAttributeDefinition. Drives the /maintenance baseline-gap audit.
--
-- TIER_1 = every person should have a value, gap surfaces as a warning.
-- TIER_2 = universal + nice-to-know, gap surfaces as a hint.
-- NONE   = not in audit (default).
--
-- Backfill uses the user-defined Tier 1 + Tier 2 lists. Slugs that don't
-- exist on a given tenant simply don't update (no-op), so the same migration
-- is safe across pulse + xpulse despite catalog divergence (xpulse has
-- freckle attrs, pulse does not, etc.).

CREATE TYPE "AuditTier" AS ENUM ('TIER_1', 'TIER_2', 'NONE');

ALTER TABLE "PhysicalAttributeDefinition"
  ADD COLUMN "tier" "AuditTier" NOT NULL DEFAULT 'NONE';

-- Tier 1 — identity-critical catalog attrs.
UPDATE "PhysicalAttributeDefinition"
SET "tier" = 'TIER_1'
WHERE slug IN (
  'hair_color',
  'weight',
  'build',
  'breast_size',
  'hair-length',
  'eye-color',
  'height',
  'ethnicity-broad',
  'ethnicity-specific'
);

-- Tier 2 — universal + nice-to-know.
UPDATE "PhysicalAttributeDefinition"
SET "tier" = 'TIER_2'
WHERE slug IN (
  'measurements',
  'bust-chest',
  'waist',
  'hips',
  'skin-tone',
  'hair-texture'
);
