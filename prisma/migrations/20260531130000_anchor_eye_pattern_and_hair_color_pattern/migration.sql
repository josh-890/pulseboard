-- Phase 2A: add visual / definitional anchors to the two SINGLE_SELECT
-- catalog entries whose vocabulary is the most technical and least self-
-- explanatory: eye_pattern (heterochromia subtypes) and hair-color-pattern
-- (styling terminology like "ombre", "balayage", "money-piece").
--
-- The picker (Phase 1, commit 1cacda1) parses any allowedValue of the form
-- `"Label (anchor)"` and surfaces the parenthetical as a dim helper line
-- under the primary label, plus a `?` icon next to the field opening a
-- popover with the full reference table. No code changes ship in this
-- migration — the picker is already wired to handle the new format.
--
-- Stored value strings change too (full canonical form), and existing
-- ScalarDelta rows are backfilled in lockstep so the picker can match the
-- current value against an allowedValues entry.
--
-- Neither attribute is in IMPORT_SCALAR_ATTRS (verified 2026-05-31), so
-- the import diff is unaffected by the wording change.

-- ─── eye_pattern (4 values) ──────────────────────────────────────────────

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'solid (single uniform color)',
     'complete-heterochromia (each eye a different color)',
     'central-heterochromia (ring around pupil differs from outer iris)',
     'sectoral-heterochromia (wedge of one iris differs)'
   ]
 WHERE slug = 'eye_pattern';

UPDATE "ScalarDelta" SET value = 'solid (single uniform color)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'eye_pattern')
   AND value = 'solid';

UPDATE "ScalarDelta" SET value = 'complete-heterochromia (each eye a different color)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'eye_pattern')
   AND value = 'complete-heterochromia';

UPDATE "ScalarDelta" SET value = 'central-heterochromia (ring around pupil differs from outer iris)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'eye_pattern')
   AND value = 'central-heterochromia';

UPDATE "ScalarDelta" SET value = 'sectoral-heterochromia (wedge of one iris differs)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'eye_pattern')
   AND value = 'sectoral-heterochromia';

-- ─── hair-color-pattern (8 values) ───────────────────────────────────────

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'solid (uniform single color)',
     'highlights (lighter strands woven through)',
     'lowlights (darker strands woven through)',
     'ombre (gradual root-to-tip fade)',
     'balayage (hand-painted, softer than highlights)',
     'two-tone (distinct zones, no gradient)',
     'money-piece (framing strands around the face)',
     'frosted-tips (bleached only at the ends)'
   ]
 WHERE slug = 'hair-color-pattern';

UPDATE "ScalarDelta" SET value = 'solid (uniform single color)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'solid';

UPDATE "ScalarDelta" SET value = 'highlights (lighter strands woven through)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'highlights';

UPDATE "ScalarDelta" SET value = 'lowlights (darker strands woven through)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'lowlights';

UPDATE "ScalarDelta" SET value = 'ombre (gradual root-to-tip fade)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'ombre';

UPDATE "ScalarDelta" SET value = 'balayage (hand-painted, softer than highlights)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'balayage';

UPDATE "ScalarDelta" SET value = 'two-tone (distinct zones, no gradient)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'two-tone';

UPDATE "ScalarDelta" SET value = 'money-piece (framing strands around the face)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'money-piece';

UPDATE "ScalarDelta" SET value = 'frosted-tips (bleached only at the ends)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-color-pattern')
   AND value = 'frosted-tips';

-- Refresh the PersonCurrentState cache so currentAttributes JSONB picks up
-- the new value strings. Idempotent.
SELECT app_recompute_person_current_state();
