-- Phase G Slice 16D · Step 2: drop Bra Size catalog def.
--
-- Per cleanup memo item 4: Bra Size overlaps with the existing
-- Bust/Chest (cm) NUMERIC + Breast Size cup-letter pair, both of which
-- are independently filterable. Bra Size's single TEXT field couldn't
-- meaningfully filter/sort. 0 deltas on both tenants pre-migration.

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'bra-size';
