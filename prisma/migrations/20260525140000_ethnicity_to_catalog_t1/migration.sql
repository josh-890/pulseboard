-- Phase G Slice 16C · T1 (additive): migrate Person.ethnicity into the
-- catalog as two SCALAR attributes — Ethnicity (Broad) SINGLE_SELECT
-- and Ethnicity (Specific) TEXT. Lives in a new top-level "Identity"
-- group.
--
-- Existing data follows an implicit Broad → Specific hierarchy via the
-- ' → ' separator (e.g. "White/Caucasian → Eastern European"). This
-- migration splits each row by that separator.
--
-- Lone legacy value 'Caucasian' (1 row on pulse, no separator) maps to
-- Broad='White/Caucasian', Specific=NULL.
--
-- Person.ethnicity column is UNTOUCHED — stays writable and readable
-- until T3 (write cutover). Slice 17 drops the column.

BEGIN;

-- 1. New top-level "Identity" group at sortOrder=0 (bump existing main
--    groups by 1; the recently-added Hair/Eye Features at sortOrder=100+
--    stay untouched).
UPDATE "PhysicalAttributeGroup"
   SET "sortOrder" = "sortOrder" + 1
 WHERE "sortOrder" < 100;

INSERT INTO "PhysicalAttributeGroup" (id, name, "sortOrder", "createdAt")
VALUES ('grp-identity', 'Identity', 0, now())
ON CONFLICT (id) DO NOTHING;

-- 2. Ethnicity (Broad) — SINGLE_SELECT, 10 standard categories.
INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, "valueType", "allowedValues",
  mutability, "statusBearing", "sortOrder", "createdAt"
) VALUES (
  'cattr-ethnicity-broad',
  'grp-identity',
  'Ethnicity (Broad)',
  'ethnicity-broad',
  'SINGLE_SELECT',
  ARRAY[
    'White/Caucasian','Black/African','Hispanic/Latino',
    'East Asian','South Asian','Pacific Islander',
    'Middle Eastern','Native/Indigenous','Mixed','Other'
  ],
  'RARELY_CHANGES', FALSE, 0, now()
) ON CONFLICT (id) DO NOTHING;

-- 3. Ethnicity (Specific) — TEXT free-form for sub-region.
INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, "valueType", "allowedValues",
  mutability, "statusBearing", "sortOrder", "createdAt"
) VALUES (
  'cattr-ethnicity-specific',
  'grp-identity',
  'Ethnicity (Specific)',
  'ethnicity-specific',
  'TEXT',
  ARRAY[]::text[],
  'RARELY_CHANGES', FALSE, 1, now()
) ON CONFLICT (id) DO NOTHING;

-- 4. Lift Person.ethnicity → Broad ScalarDelta on baseline Era.
--    Tagged with dateSource='migration-phase-g-slice-16c' for
--    identifiability + idempotency (ON CONFLICT DO NOTHING).
INSERT INTO "ScalarDelta" (
  id, "eraId", "attributeDefinitionId", value, date, "datePrecision",
  "dateModifier", "dateSource", notes, "createdAt"
)
SELECT
  'sd-mig-16c-broad-' || p.id,
  e.id,
  'cattr-ethnicity-broad',
  CASE
    WHEN p.ethnicity = 'Caucasian' THEN 'White/Caucasian'
    WHEN position(' → ' in p.ethnicity) > 0 THEN trim(split_part(p.ethnicity, ' → ', 1))
    ELSE trim(p.ethnicity)
  END,
  NULL, 'UNKNOWN', 'EXACT',
  'migration-phase-g-slice-16c',
  NULL, now()
FROM "Person" p
JOIN "Era" e ON e."personId" = p.id AND e."isBaseline" = TRUE
WHERE p.ethnicity IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 5. Lift Specific part for rows that have ' → ' separator + non-empty
--    right side.
INSERT INTO "ScalarDelta" (
  id, "eraId", "attributeDefinitionId", value, date, "datePrecision",
  "dateModifier", "dateSource", notes, "createdAt"
)
SELECT
  'sd-mig-16c-specific-' || p.id,
  e.id,
  'cattr-ethnicity-specific',
  trim(split_part(p.ethnicity, ' → ', 2)),
  NULL, 'UNKNOWN', 'EXACT',
  'migration-phase-g-slice-16c',
  NULL, now()
FROM "Person" p
JOIN "Era" e ON e."personId" = p.id AND e."isBaseline" = TRUE
WHERE p.ethnicity IS NOT NULL
  AND position(' → ' in p.ethnicity) > 0
  AND trim(split_part(p.ethnicity, ' → ', 2)) <> ''
ON CONFLICT (id) DO NOTHING;

-- 6. Row-count assertion: every Person with non-null ethnicity has a
--    matching Broad delta.
DO $$
DECLARE
  src INT;
  dst_broad INT;
BEGIN
  SELECT COUNT(*) INTO src FROM "Person" WHERE ethnicity IS NOT NULL;
  SELECT COUNT(*) INTO dst_broad FROM "ScalarDelta"
   WHERE "attributeDefinitionId" = 'cattr-ethnicity-broad'
     AND "dateSource" = 'migration-phase-g-slice-16c';
  IF src <> dst_broad THEN
    RAISE EXCEPTION 'Ethnicity Broad migration count mismatch: src=% dst=%', src, dst_broad;
  END IF;
END $$;

-- 7. Vocab assertion: every Broad delta value is in the SINGLE_SELECT
--    allowedValues. Catches typos / unexpected source data.
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM "ScalarDelta"
   WHERE "attributeDefinitionId" = 'cattr-ethnicity-broad'
     AND "dateSource" = 'migration-phase-g-slice-16c'
     AND value NOT IN (
       'White/Caucasian','Black/African','Hispanic/Latino',
       'East Asian','South Asian','Pacific Islander',
       'Middle Eastern','Native/Indigenous','Mixed','Other'
     );
  IF bad > 0 THEN
    RAISE EXCEPTION 'Ethnicity Broad: % deltas have value outside the allowed vocab', bad;
  END IF;
END $$;

-- 8. Recompute fold so currentAttributes JSON picks up the new
--    ethnicity-broad / ethnicity-specific entries.
SELECT app_recompute_person_current_state();

COMMIT;
