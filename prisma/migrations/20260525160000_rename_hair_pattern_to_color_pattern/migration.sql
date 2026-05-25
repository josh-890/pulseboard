-- Phase G Slice 16D · Step 1: rename 'Hair Pattern' → 'Hair Color Pattern'.
--
-- Existing allowedValues (solid / highlights / lowlights / ombre / balayage
-- / two-tone / money-piece / frosted-tips) are dye-application styles, not
-- curl pattern. The name 'Hair Pattern' is misleading now that we have a
-- separate 'Hair Texture' attribute (Phase G Slice 16B) which IS curl
-- pattern. Add 'Color' to disambiguate.
--
-- Row exists only on xpulse; pulse has no matching row. 0 deltas reference
-- it on either tenant so the id stays untouched (no orphan deltas).
-- Slug renamed too for consistency.

UPDATE "PhysicalAttributeDefinition"
   SET name = 'Hair Color Pattern',
       slug = 'hair-color-pattern'
 WHERE slug = 'hair_pattern';
