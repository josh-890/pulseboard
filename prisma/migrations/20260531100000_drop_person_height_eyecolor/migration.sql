-- Catalog data quality cleanup: drop Person.height and Person.eyeColor.
--
-- Both columns were no-ops since Phase G Slice 3a — the values have been
-- written to baseline ScalarDeltas under cattr-height / cattr-eye-color
-- and read from there via the SQL fold's PersonCurrentState.currentAttributes
-- JSONB cache. Audit (2026-05-31) on both tenants confirmed:
--   - Every person with Person.height set has a matching baseline delta.
--   - Same for Person.eyeColor.
--   - The delta count is HIGHER than the column count (newer persons skip
--     the column entirely), so the columns carry no unique information.
--
-- Code changes that ship alongside this migration:
--   - person-search-service.ts: height range filter switches from `p.height`
--     to `(mv."currentAttributes"->>'height')::int`.
--   - color-catalog-service.ts: deletion safety check for eye colors now
--     counts via ScalarDelta(cattr-eye-color) instead of Person.eyeColor.
--   - completeness-service.ts: BatchPersonData type drops both fields
--     (already unused — score was already sourced from baseline deltas).
--   - person-service.ts: list-query batchData payloads drop both fields.
--   - prisma/seed.ts: dev seed no longer writes the dropped columns.

ALTER TABLE "Person" DROP COLUMN "height";
ALTER TABLE "Person" DROP COLUMN "eyeColor";
