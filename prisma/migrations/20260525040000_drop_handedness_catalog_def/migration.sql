-- Phase G Slice 16B · Attr 1: drop Handedness from the catalog.
--
-- User decision 2026-05-25: they don't track handedness; the row is
-- noise in the catalog manager. 0 ScalarDelta references on both
-- tenants (verified pre-migration), so no orphan cleanup.
--
-- Reversible from the catalog manager UI if ever wanted.

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'handedness';
