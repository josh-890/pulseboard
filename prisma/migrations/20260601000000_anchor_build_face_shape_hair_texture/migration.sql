-- Phase 2B + 2C: add anchors to the remaining three SINGLE_SELECT catalog
-- entries — build (subjective body-type labels), face-shape (face-geometry
-- terms), hair-texture (curl typing). Same trailing-parens convention as
-- Phase 1 (hair-length) and Phase 2A (eye_pattern, hair-color-pattern):
-- the picker (commit 1cacda1) parses the parenthetical into a dim helper
-- line under the primary label.
--
-- Picker behaviour ships in Phase 1. This migration changes data only.
--
-- Import compatibility:
--   - build is in IMPORT_SCALAR_ATTRS but with no parserKey, so the parser
--     never produces a build value → no import-side string mismatch.
--   - face-shape and hair-texture are not in IMPORT_SCALAR_ATTRS at all.
--
-- All three are statusBearing=false, so the AttributeStatus pill UI
-- isn't affected.

-- ─── build (6 values, 'Other' has no anchor) ────────────────────────────

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'Slim (thin frame, low body mass)',
     'Normal (average proportions)',
     'Athletic (toned, defined muscles)',
     'Curvy (pronounced hips/bust, narrow waist)',
     'Plus (fuller figure)',
     'Other'
   ]
 WHERE slug = 'build';

UPDATE "ScalarDelta" SET value = 'Slim (thin frame, low body mass)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'build')
   AND value = 'Slim';

UPDATE "ScalarDelta" SET value = 'Normal (average proportions)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'build')
   AND value = 'Normal';

UPDATE "ScalarDelta" SET value = 'Athletic (toned, defined muscles)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'build')
   AND value = 'Athletic';

UPDATE "ScalarDelta" SET value = 'Curvy (pronounced hips/bust, narrow waist)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'build')
   AND value = 'Curvy';

UPDATE "ScalarDelta" SET value = 'Plus (fuller figure)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'build')
   AND value = 'Plus';

-- 'Other' has no anchor — no backfill needed.

-- ─── face-shape (5 values) ──────────────────────────────────────────────

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'Oval (balanced, slight taper to chin)',
     'Round (similar width and length, soft curves)',
     'Square (strong jaw, forehead and jaw equal width)',
     'Heart (wide forehead, narrow pointed chin)',
     'Long (longer than wide, straighter cheekbones)'
   ]
 WHERE slug = 'face-shape';

UPDATE "ScalarDelta" SET value = 'Oval (balanced, slight taper to chin)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'face-shape')
   AND value = 'Oval';

UPDATE "ScalarDelta" SET value = 'Round (similar width and length, soft curves)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'face-shape')
   AND value = 'Round';

UPDATE "ScalarDelta" SET value = 'Square (strong jaw, forehead and jaw equal width)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'face-shape')
   AND value = 'Square';

UPDATE "ScalarDelta" SET value = 'Heart (wide forehead, narrow pointed chin)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'face-shape')
   AND value = 'Heart';

UPDATE "ScalarDelta" SET value = 'Long (longer than wide, straighter cheekbones)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'face-shape')
   AND value = 'Long';

-- ─── hair-texture (4 values, curl typing system) ────────────────────────

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'Straight (type 1, no curl)',
     'Wavy (type 2, loose S-shape)',
     'Curly (type 3, defined ringlets)',
     'Coily (type 4, tight zigzag/coils)'
   ]
 WHERE slug = 'hair-texture';

UPDATE "ScalarDelta" SET value = 'Straight (type 1, no curl)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-texture')
   AND value = 'Straight';

UPDATE "ScalarDelta" SET value = 'Wavy (type 2, loose S-shape)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-texture')
   AND value = 'Wavy';

UPDATE "ScalarDelta" SET value = 'Curly (type 3, defined ringlets)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-texture')
   AND value = 'Curly';

UPDATE "ScalarDelta" SET value = 'Coily (type 4, tight zigzag/coils)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-texture')
   AND value = 'Coily';

-- Refresh PersonCurrentState cache so currentAttributes JSONB picks up
-- the new build / face-shape / hair-texture strings.
SELECT app_recompute_person_current_state();
