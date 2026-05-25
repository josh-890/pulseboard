-- Phase G Slice 16 Phase A · Step 1: fix "Freckle Intesity" → "Freckle Intensity"
-- typo in PhysicalAttributeDefinition.
--
-- The row exists only on xpulse (one row, slug='freckle-intesity'). On pulse
-- the WHERE filter matches zero rows so this is a no-op there.
--
-- The primary key `id` is untouched, so existing ScalarDelta rows that
-- reference this definition by attributeDefinitionId stay linked — no
-- orphan deltas. Only `name` (display label) and `slug` (internal lookup
-- key, not used in any URL/route today) change.

UPDATE "PhysicalAttributeDefinition"
   SET name = 'Freckle Intensity',
       slug = 'freckle-intensity'
 WHERE slug = 'freckle-intesity';
