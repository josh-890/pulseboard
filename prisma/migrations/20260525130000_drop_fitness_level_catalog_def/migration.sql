-- Phase G Slice 16B · Attr 10: drop Fitness Level catalog def.
--
-- User decision 2026-05-25: Build + Build Modifier (Toned / Defined abs
-- / Muscular tags) already capture the observable proxy for fitness
-- from a photo. Manual Fitness Level is redundant inference. 0 deltas
-- on both tenants → safe drop.

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'fitness-level';
