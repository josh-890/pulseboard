-- Phase G Slice 16B · Attr 9: drop Facial Hair catalog def.
--
-- User decision 2026-05-25: not relevant for the women-focused dataset.
-- 0 deltas on both tenants → safe drop.

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'facial-hair';
