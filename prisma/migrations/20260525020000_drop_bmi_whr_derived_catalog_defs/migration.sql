-- Phase G Slice 16 Phase A · Step 3: drop BMI + Waist-to-Hip Ratio
-- catalog definitions per project_catalog_data_quality_cleanup.md item 2.
--
-- These attributes are mathematically derived (BMI = weight / height²;
-- WHR = waist / hips) and should be display-only computations, not stored
-- ScalarDelta entries. The catalog rows allowed the user to type values
-- by hand — a data-quality footgun.
--
-- Both rows have 0 ScalarDelta references on both tenants (verified
-- pre-migration), so there are no orphan deltas to clean up. The
-- source-of-truth attributes (waist, hips, weight, height) stay.
--
-- Idempotent: DELETE WHERE slug IN (...) — if a slug is re-created later
-- via the catalog manager, this migration won't re-delete it (it ran once).
--
-- Rollback: re-create the rows via the catalog manager UI; the ids will
-- change but no FK depends on them.

DELETE FROM "PhysicalAttributeDefinition"
 WHERE slug IN ('bmi', 'waist-to-hip-ratio');
