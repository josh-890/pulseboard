-- Pulled forward from Slice 17: delete all legacy CosmeticProcedure row data.
--
-- Why now (instead of waiting for the full Slice 17 schema contraction): the
-- legacy rows are still rendered by the History panel (orphan event blocks
-- on each Era card). When a CosmeticProcedureEvent shares an Era with its
-- Slice-4-migrated SURGICAL ScalarDelta, the user sees two records for the
-- same real-world event and editing the delta's date doesn't propagate to
-- the procedure event — actively blocking date authoring (reported for
-- Lilit A on xpulse).
--
-- The data carried on each procedure event was migrated to ScalarDelta
-- (cause=SURGICAL) in migration 20260524030000_add_delta_cause_and_migrate_procedures
-- for every event whose parent CosmeticProcedure had attributeDefinitionId
-- set. Events without a scalar target (1 row on pulse: Connie Nielsen lip
-- filler 1999) are dropped per user decision 2026-05-24 — the user chose
-- delete over migrating to a defensive-fallback BodyMark.
--
-- The CosmeticProcedure / CosmeticProcedureEvent TABLES themselves stay in
-- place. Slice 17 drops them later (alongside dropping the related
-- PersonMediaLink.cosmeticProcedureId column and the legacy
-- CosmeticProcedureEventType enum).
--
-- Rollback: restore from the pre-deploy backup (scripts/db-backup.sh).

BEGIN;

DO $$
DECLARE
  events_before INT;
  procedures_before INT;
  events_after INT;
  procedures_after INT;
BEGIN
  SELECT COUNT(*) INTO events_before FROM "CosmeticProcedureEvent";
  SELECT COUNT(*) INTO procedures_before FROM "CosmeticProcedure";

  -- Delete events first (FK from CosmeticProcedureEvent → CosmeticProcedure).
  DELETE FROM "CosmeticProcedureEvent";
  DELETE FROM "CosmeticProcedure";

  SELECT COUNT(*) INTO events_after FROM "CosmeticProcedureEvent";
  SELECT COUNT(*) INTO procedures_after FROM "CosmeticProcedure";

  IF events_after <> 0 OR procedures_after <> 0 THEN
    RAISE EXCEPTION 'Cleanup did not zero out CosmeticProcedure tables: % events, % procedures remain', events_after, procedures_after;
  END IF;

  RAISE NOTICE 'Deleted % CosmeticProcedureEvent rows and % CosmeticProcedure rows.', events_before, procedures_before;
END $$;

-- Garbage-collect any draft Era that became empty as a result. Mirrors the
-- in-app deleteDraftEraIfEmpty helper (Phase G Slice 8): a draft Era with
-- zero members across all child relations is noise and should disappear.
DO $$
DECLARE
  deleted_era_count INT;
BEGIN
  WITH empty_drafts AS (
    SELECT e.id
      FROM "Era" e
     WHERE e."isDraft" = TRUE
       AND e."isBaseline" = FALSE
       AND NOT EXISTS (SELECT 1 FROM "ScalarDelta"            x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "BodyMarkEvent"          x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "BodyModificationEvent"  x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "DigitalIdentityEvent"   x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "InterestEvent"          x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "PersonSkillEvent"       x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "SessionContribution"    x WHERE x."eraId" = e.id)
       AND NOT EXISTS (SELECT 1 FROM "PersonDigitalIdentity"  x WHERE x."eraId" = e.id)
  ), del AS (
    DELETE FROM "Era"
     WHERE id IN (SELECT id FROM empty_drafts)
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_era_count FROM del;

  RAISE NOTICE 'Garbage-collected % empty draft Era(s) after procedure cleanup.', deleted_era_count;
END $$;

COMMIT;
