-- Phase 2D: anchor breast_size with visual-scale descriptors.
--
-- The earlier plan deferred breast_size on the grounds that cup letters
-- are internationally standardised. After user feedback the picker reads
-- better with a visual descriptor (small / medium / full / etc.) anchored
-- to each cup — the descriptor doubles as a calibration check when the
-- raw cup letter isn't visually obvious from a reference photo.
--
-- The descriptor is intentionally a relative scale ("small to medium",
-- "full", "very full"), not a measurement range — sister sizing and
-- regional band variance make absolute cm anchors misleading. The scale
-- only needs to communicate "where on AA→F does this cup sit visually".
--
-- Picker behaviour: shipped in Phase 1 (commit 1cacda1). Two-line
-- SelectItems + ? popover read the trailing parens automatically.
--
-- Import compatibility: breast_size IS in IMPORT_SCALAR_ATTRS with
-- parserKey='breastDescription' — the parser produces single-letter
-- cup values like "B" or "DD" parsed from import-file descriptions.
-- After this migration the canonical stored value is the FULL anchored
-- string, so the import path must normalise its single-letter output
-- to the canonical string before writing a ScalarDelta. That code
-- change ships alongside this migration.

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'AA (very small / nearly flat)',
     'A (small)',
     'B (small to medium)',
     'C (medium)',
     'D (full)',
     'DD (very full)',
     'E (extra full)',
     'F (very large)'
   ]
 WHERE slug = 'breast_size';

UPDATE "ScalarDelta" SET value = 'AA (very small / nearly flat)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'AA';

UPDATE "ScalarDelta" SET value = 'A (small)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'A';

UPDATE "ScalarDelta" SET value = 'B (small to medium)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'B';

UPDATE "ScalarDelta" SET value = 'C (medium)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'C';

UPDATE "ScalarDelta" SET value = 'D (full)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'D';

UPDATE "ScalarDelta" SET value = 'DD (very full)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'DD';

UPDATE "ScalarDelta" SET value = 'E (extra full)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'E';

UPDATE "ScalarDelta" SET value = 'F (very large)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'breast_size')
   AND value = 'F';

-- Out-of-vocab values (e.g. 'DD/E', empty strings) are pre-existing data
-- anomalies and stay untouched. The picker couldn't match them before this
-- migration either; fixing them is a separate data-quality concern.

SELECT app_recompute_person_current_state();
