-- Phase C follow-up — migration 20260522000003 converts enhanced breast
-- statuses into CosmeticProcedures, which feed the fold (hasProcedure /
-- procedureRegions), but does not recompute PersonCurrentState afterward.
-- Recompute every row so the cache is correct by construction.

SELECT app_recompute_person_current_state();
