-- Slice 3a of Phase G (ADR-0005): migrate Person.eyeColor + Person.height into
-- the catalog/delta system as Baseline ScalarDelta rows. Person columns are
-- left in place for safety; they become unread after this slice and get dropped
-- in Slice 17 (the contraction step). Both attributes are ALWAYS_STATIC.
--
-- Eye Color stays valueType=TEXT to preserve the color_catalog ecosystem
-- (lookup_eye_hue / lookup_eye_shade / etc. normalise the text at fold time).
-- Height is NUMERIC with unit=cm.
--
-- ethnicity is handled in Slice 3b (separate slice — touches search facets).

BEGIN;

-- ─── Catalog: idempotent INSERT ──────────────────────────────────────────────

INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, unit, "valueType", "allowedValues",
  "ordinalMin", "ordinalMax", mutability, "sortOrder", "createdAt"
)
VALUES
  (
    'cattr-eye-color',
    'cmpck5diu0005fh9yz1vy8uhz',  -- Eye Features group
    'Eye Color',
    'eye-color',
    NULL,
    'TEXT',
    ARRAY[]::text[],
    NULL, NULL,
    'ALWAYS_STATIC',
    0,
    NOW()
  ),
  (
    'cattr-height',
    'db9e2617-a209-4c10-9956-a6a1209d85b6',  -- Core Body Measurements group
    'Height',
    'height',
    'cm',
    'NUMERIC',
    ARRAY[]::text[],
    NULL, NULL,
    'ALWAYS_STATIC',
    0,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Data: lift Person column values → Baseline ScalarDelta rows ─────────────
-- Tagged with dateSource='migration-phase-g-slice-3a' so they're identifiable
-- (also used by rollback / verification queries).

INSERT INTO "ScalarDelta" (
  id, "eraId", "attributeDefinitionId", value, date, "datePrecision",
  "dateModifier", "dateSource", notes, "createdAt"
)
SELECT
  'sd-mig-3a-eye-' || p.id,
  e.id,
  'cattr-eye-color',
  p."eyeColor",
  NULL, 'UNKNOWN', 'EXACT',
  'migration-phase-g-slice-3a',
  NULL,
  NOW()
FROM "Person" p
JOIN "Era" e ON e."personId" = p.id AND e."isBaseline" = TRUE
WHERE p."eyeColor" IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO "ScalarDelta" (
  id, "eraId", "attributeDefinitionId", value, date, "datePrecision",
  "dateModifier", "dateSource", notes, "createdAt"
)
SELECT
  'sd-mig-3a-height-' || p.id,
  e.id,
  'cattr-height',
  p.height::text,
  NULL, 'UNKNOWN', 'EXACT',
  'migration-phase-g-slice-3a',
  NULL,
  NOW()
FROM "Person" p
JOIN "Era" e ON e."personId" = p.id AND e."isBaseline" = TRUE
WHERE p.height IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ─── Row-count assertion ─────────────────────────────────────────────────────
-- Aborts the migration if the lifted-delta count doesn't equal the non-null
-- Person column count.

DO $$
DECLARE
  src_eye INT;
  dst_eye INT;
  src_h   INT;
  dst_h   INT;
BEGIN
  SELECT COUNT(*) INTO src_eye FROM "Person" WHERE "eyeColor" IS NOT NULL;
  SELECT COUNT(*) INTO dst_eye FROM "ScalarDelta"
    WHERE "attributeDefinitionId" = 'cattr-eye-color'
      AND "dateSource" = 'migration-phase-g-slice-3a';
  IF src_eye <> dst_eye THEN
    RAISE EXCEPTION 'eyeColor migration count mismatch: src=% dst=%', src_eye, dst_eye;
  END IF;

  SELECT COUNT(*) INTO src_h FROM "Person" WHERE height IS NOT NULL;
  SELECT COUNT(*) INTO dst_h FROM "ScalarDelta"
    WHERE "attributeDefinitionId" = 'cattr-height'
      AND "dateSource" = 'migration-phase-g-slice-3a';
  IF src_h <> dst_h THEN
    RAISE EXCEPTION 'height migration count mismatch: src=% dst=%', src_h, dst_h;
  END IF;
END $$;

-- ─── Refresh the per-person fold cache ───────────────────────────────────────
-- The new deltas need to be folded into PersonCurrentState so reads see them.

SELECT app_recompute_person_current_state();

COMMIT;
