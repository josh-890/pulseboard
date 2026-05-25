-- Phase G Slice 16E: case-normalize hair/eye/skin ScalarDelta values to
-- match the color_catalog.display (title case) for the matching entry.
--
-- Pre-migration audit confirmed all existing hair/eye delta values map
-- cleanly to color_catalog when lower-cased; no off-catalog values
-- across either tenant. Skin tone has 0 deltas. The mismatch was
-- purely cosmetic: ColorValueCombobox writes value_norm (lowercase)
-- while legacy deltas have mixed casing ("Blonde" vs "blonde"). Both
-- read identically through lookup_hair_hue() etc., but rendered
-- inconsistently.
--
-- After this migration, all color deltas use the catalog's `display`
-- form. ColorValueCombobox is changed in the same commit to write
-- `display` going forward (avoids re-drifting).
--
-- Idempotent: the `sd.value <> cc.display` guard prevents a no-op
-- re-write. The match uses lower(trim(...)) on the LHS so legacy
-- variants in any casing find their canonical display.

BEGIN;

DO $$
DECLARE
  affected INT;
BEGIN
  -- Hair Color
  WITH upd AS (
    UPDATE "ScalarDelta" sd
       SET value = cc.display
      FROM color_catalog cc
     WHERE sd."attributeDefinitionId" = 'cattr-hair-color'
       AND cc.category = 'hair'
       AND lower(trim(sd.value)) = cc.value_norm
       AND sd.value <> cc.display
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upd;
  RAISE NOTICE 'Phase 16E: normalized % Hair Color delta(s) to catalog display.', affected;

  -- Eye Color
  WITH upd AS (
    UPDATE "ScalarDelta" sd
       SET value = cc.display
      FROM color_catalog cc
     WHERE sd."attributeDefinitionId" = 'cattr-eye-color'
       AND cc.category = 'eye'
       AND lower(trim(sd.value)) = cc.value_norm
       AND sd.value <> cc.display
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upd;
  RAISE NOTICE 'Phase 16E: normalized % Eye Color delta(s) to catalog display.', affected;

  -- Skin Tone (0 deltas in prod pre-migration; safe no-op)
  WITH upd AS (
    UPDATE "ScalarDelta" sd
       SET value = cc.display
      FROM "PhysicalAttributeDefinition" pad,
           color_catalog cc
     WHERE sd."attributeDefinitionId" = pad.id
       AND pad.slug = 'skin-tone'
       AND cc.category = 'skin'
       AND lower(trim(sd.value)) = cc.value_norm
       AND sd.value <> cc.display
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upd;
  RAISE NOTICE 'Phase 16E: normalized % Skin Tone delta(s) to catalog display.', affected;
END $$;

-- Recompute PersonCurrentState since currentHairColor / eyeColor reads
-- propagate the raw delta value into the cache.
SELECT app_recompute_person_current_state();

COMMIT;
