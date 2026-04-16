-- Make ArchiveFolder.archiveKey required (non-nullable).
-- archiveKey is now the folder's stable identity, generated at first scan time,
-- independent of whether a Set/StagingSet link has been confirmed.

-- Step 1: Add DB-level default so backfill and future raw INSERTs use the same generator
ALTER TABLE "archive_folder" ALTER COLUMN "archiveKey" SET DEFAULT gen_random_uuid()::text;

-- Step 2: Backfill any existing NULL values
UPDATE "archive_folder" SET "archiveKey" = gen_random_uuid()::text WHERE "archiveKey" IS NULL;

-- Step 3: Apply NOT NULL constraint (safe now — all rows have a value)
ALTER TABLE "archive_folder" ALTER COLUMN "archiveKey" SET NOT NULL;
