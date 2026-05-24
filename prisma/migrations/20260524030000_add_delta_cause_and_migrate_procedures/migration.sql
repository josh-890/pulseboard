-- Slice 4 of Phase G (ADR-0007): cause-on-delta drives Natural/Enhanced/Restored
-- status. This migration:
--   1. Adds DeltaCause enum + `cause` column to ScalarDelta, BodyMarkEvent,
--      BodyModificationEvent. Default NATURAL.
--   2. Migrates each CosmeticProcedureEvent that targets a scalar attribute
--      into a ScalarDelta with cause=SURGICAL (date/era preserved).
--   3. Leaves CosmeticProcedure / CosmeticProcedureEvent tables in place —
--      they're dropped in Slice 17 after soak.
--
-- The SQL/TS fold switch to cause-based derivation happens in code (see
-- person-service.ts + the SQL fold function update in this slice).

BEGIN;

-- ─── Enum + columns ──────────────────────────────────────────────────────────

CREATE TYPE "DeltaCause" AS ENUM ('NATURAL', 'SURGICAL', 'OTHER');

ALTER TABLE "ScalarDelta"
  ADD COLUMN "cause" "DeltaCause" NOT NULL DEFAULT 'NATURAL';

ALTER TABLE "BodyMarkEvent"
  ADD COLUMN "cause" "DeltaCause" NOT NULL DEFAULT 'NATURAL';

ALTER TABLE "BodyModificationEvent"
  ADD COLUMN "cause" "DeltaCause" NOT NULL DEFAULT 'NATURAL';

-- ─── Data migration: CosmeticProcedureEvent → ScalarDelta (cause=SURGICAL) ───
-- Tagged with dateSource='migration-phase-g-slice-4-procedures' so they're
-- identifiable (and idempotent on re-run via ON CONFLICT DO NOTHING).
--
-- Only events whose parent CosmeticProcedure has a non-null attributeDefinitionId
-- are converted. Per ADR-0007 § "Migration", events without a target should
-- become a BodyMark of type=other — the user reports none exist in real data,
-- so this defensive case is omitted here. Add a follow-up if any appear.

INSERT INTO "ScalarDelta" (
  id, "eraId", "attributeDefinitionId", value, date, "datePrecision",
  "dateModifier", "dateSource", notes, cause, "createdAt"
)
SELECT
  'sd-mig-s4-' || cpe.id,
  cpe."eraId",
  cp."attributeDefinitionId",
  COALESCE(NULLIF(cpe."valueAfter", ''), ''),
  cpe.date,
  cpe."datePrecision",
  cpe."dateModifier",
  'migration-phase-g-slice-4-procedures',
  -- Preserve provider/notes/description in the delta notes field.
  trim(
    COALESCE(cpe.notes, '')
    || CASE WHEN cpe.provider IS NOT NULL AND cpe.provider <> ''
            THEN ' [provider: ' || cpe.provider || ']'
            ELSE '' END
    || CASE WHEN cpe.description IS NOT NULL AND cpe.description <> ''
            THEN ' ' || cpe.description
            ELSE '' END
  ),
  'SURGICAL',
  NOW()
FROM "CosmeticProcedureEvent" cpe
JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId"
WHERE cp."attributeDefinitionId" IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ─── Row-count assertion ─────────────────────────────────────────────────────

DO $$
DECLARE
  src INT;
  dst INT;
BEGIN
  SELECT COUNT(*) INTO src
    FROM "CosmeticProcedureEvent" cpe
    JOIN "CosmeticProcedure" cp ON cp.id = cpe."cosmeticProcedureId"
    WHERE cp."attributeDefinitionId" IS NOT NULL;
  SELECT COUNT(*) INTO dst
    FROM "ScalarDelta"
    WHERE "dateSource" = 'migration-phase-g-slice-4-procedures';
  IF src <> dst THEN
    RAISE EXCEPTION 'procedure→delta migration count mismatch: src=% dst=%', src, dst;
  END IF;
END $$;

-- ─── Recompute the per-person fold cache ─────────────────────────────────────
-- The new deltas need to be folded into PersonCurrentState so reads see them.

SELECT app_recompute_person_current_state();

COMMIT;
