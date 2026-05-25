-- Phase G Slice 16B · Attr 4: drop Undertone catalog def.
--
-- User decision 2026-05-25: PersonCurrentState.skinUndertone is already
-- auto-derived from skin_tone via the SQL lookup_skin_undertone() helper.
-- A manual Undertone attribute is redundant and risks drift. 0 deltas
-- on both tenants pre-migration → safe drop.
--
-- If a per-person override is ever wanted, that becomes an override flag
-- on Skin Tone (not a parallel scalar attribute).

DELETE FROM "PhysicalAttributeDefinition" WHERE slug = 'undertone';
