-- Slice 1 of Phase G (ADR-0005): Mutability policy on PhysicalAttributeDefinition.
-- Drives UI affordance per attribute row (static label / value+change / value+sparkline+change).
-- Future authoring affordance + validation only; never touches stored history.

-- ─── Enum ────────────────────────────────────────────────────────────────────

CREATE TYPE "Mutability" AS ENUM ('ALWAYS_STATIC', 'RARELY_CHANGES', 'VOLATILE');

-- ─── Column ──────────────────────────────────────────────────────────────────
-- Safe middle as default; backfill overrides per attribute below.

ALTER TABLE "PhysicalAttributeDefinition"
  ADD COLUMN "mutability" "Mutability" NOT NULL DEFAULT 'RARELY_CHANGES';

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Mapping per project_scalar_attribute_ui.md. Slugs use the actual values
-- present in the catalog today (slug naming is inconsistent — `_` vs `-` —
-- a later data-quality cleanup will normalise this).

-- ALWAYS_STATIC — attributes that don't change in adult life
UPDATE "PhysicalAttributeDefinition" SET "mutability" = 'ALWAYS_STATIC'
  WHERE slug IN (
    'handedness',
    'eye_pattern',
    'limbal_ring',
    'brushfield_spots'
  );

-- VOLATILE — attributes that change frequently
UPDATE "PhysicalAttributeDefinition" SET "mutability" = 'VOLATILE'
  WHERE slug IN (
    'weight',
    'hair_color',
    'hair-length',
    'body-fat',
    'roots_showing',
    'facial-hair',
    'graying'
  );

-- Everything else stays at the default `RARELY_CHANGES`.
