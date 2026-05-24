-- One-shot fix for Phase G Slice 3a migration on prod tenants.
-- The committed migration hardcoded dev's group UUIDs which don't exist on
-- prod. This version looks up group IDs by NAME — works on any tenant and is
-- idempotent (safe to re-run; ON CONFLICT skips already-existing rows).
--
-- After running this manually on a tenant, mark the original migration as
-- applied via: prisma migrate resolve --applied 20260524020000_migrate_eye_color_and_height_to_catalog

BEGIN;

-- ─── Catalog: idempotent INSERT (name-based group lookup) ────────────────────

INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, unit, "valueType", "allowedValues",
  "ordinalMin", "ordinalMax", mutability, "sortOrder", "createdAt"
)
SELECT
  'cattr-eye-color',
  g.id,
  'Eye Color',
  'eye-color',
  NULL,
  'TEXT',
  ARRAY[]::text[],
  NULL, NULL,
  'ALWAYS_STATIC',
  0,
  NOW()
FROM "PhysicalAttributeGroup" g WHERE g.name = 'Eye Features'
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, unit, "valueType", "allowedValues",
  "ordinalMin", "ordinalMax", mutability, "sortOrder", "createdAt"
)
SELECT
  'cattr-height',
  g.id,
  'Height',
  'height',
  'cm',
  'NUMERIC',
  ARRAY[]::text[],
  NULL, NULL,
  'ALWAYS_STATIC',
  0,
  NOW()
FROM "PhysicalAttributeGroup" g WHERE g.name = 'Core Body Measurements'
ON CONFLICT (id) DO NOTHING;

-- ─── Data: lift Person column values → Baseline ScalarDelta rows ─────────────

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

SELECT app_recompute_person_current_state();

COMMIT;
