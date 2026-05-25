-- Phase G Slice 16B · Attr 5: drop Complexion catalog def.
--
-- User decision 2026-05-25: skin condition (oily/dry/combination/normal)
-- isn't useful to judge from photos in this app's workflow. 0 deltas on
-- both tenants → safe drop.

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'complexion';
