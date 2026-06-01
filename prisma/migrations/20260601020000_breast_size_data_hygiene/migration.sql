-- Breast-size data hygiene — clean up two pre-existing anomalies surfaced
-- by the Phase 2D anchor migration (`20260601010000_anchor_breast_size`).
--
-- Both rows pre-date the catalog-vocab tightening; neither was created by
-- the anchor migration. They were left alone there to avoid silently
-- rewriting potentially-meaningful data without user input. That input
-- has now been collected (2026-06-01), and the resolutions are:
--
--   1. DD/E row → 'DD (very full)' (lower bound of the original "in
--      between DD and E" interval), notes preserved so the ambiguity is
--      auditable.
--   2. Empty + isVerifiedUnknown=false row (Jane / seed-person-1) → delete
--      (it's neither a real value nor a verified-unknown marker; the fold
--      filters empties anyway, so this just removes dead audit noise).
--
-- The OTHER empty row (Nancy A) has isVerifiedUnknown=true — that's the
-- canonical "we know we don't know" sentinel from ADR-0009. It's correct
-- and stays.
--
-- The two affected rows are identified by their ScalarDelta.id so this
-- migration is idempotent against any other tenant: missing IDs no-op,
-- and the IDs are stable cuids/uuids that won't collide.

UPDATE "ScalarDelta"
   SET value = 'DD (very full)',
       notes = COALESCE(NULLIF(notes, ''), '') || 'originally DD/E (pre-anchor vocab)'
 WHERE id = 'c6c61216-408f-4966-b771-3c64447751e4'
   AND value = 'DD/E';

DELETE FROM "ScalarDelta"
 WHERE id = 'f247f01c-6239-4387-8f70-d85d15042691'
   AND value = ''
   AND "isVerifiedUnknown" = false;

SELECT app_recompute_person_current_state();
