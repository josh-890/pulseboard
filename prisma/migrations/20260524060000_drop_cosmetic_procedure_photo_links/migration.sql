-- Slice 5 of Phase G (ADR-0007): drop the Cosmetic Procedures UI.
-- Per user decision (2026-05-24): photos previously attached to a cosmetic
-- procedure are not worth preserving — delete those link rows.
--
-- The CosmeticProcedure / CosmeticProcedureEvent tables themselves stay in
-- place (dropped in Slice 17 after soak). The PersonMediaLink.cosmeticProcedureId
-- column also stays for now; only the rows are removed.
--
-- Rollback note: there is no inverse for a DELETE — restore from
-- backups/ if needed (pre-deploy backup is taken in scripts/db-backup.sh).

BEGIN;

DO $$
DECLARE
  before_cnt INT;
  after_cnt INT;
BEGIN
  SELECT COUNT(*) INTO before_cnt
    FROM "PersonMediaLink"
    WHERE "cosmeticProcedureId" IS NOT NULL;

  DELETE FROM "PersonMediaLink"
    WHERE "cosmeticProcedureId" IS NOT NULL;

  SELECT COUNT(*) INTO after_cnt
    FROM "PersonMediaLink"
    WHERE "cosmeticProcedureId" IS NOT NULL;

  IF after_cnt <> 0 THEN
    RAISE EXCEPTION 'Slice 5 cleanup: expected 0 remaining PersonMediaLink rows with cosmeticProcedureId, got %', after_cnt;
  END IF;

  RAISE NOTICE 'Slice 5 cleanup: deleted % PersonMediaLink rows anchored to cosmetic procedures.', before_cnt;
END $$;

COMMIT;
