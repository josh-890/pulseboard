-- Migration: archive_link_invert
--
-- Inverts the staging-era archive link: instead of ArchiveFolder.linkedStagingId → StagingSet,
-- StagingSet.archiveFolderId → ArchiveFolder (UNIQUE). ArchiveFolder.linkedSetId remains the
-- permanent post-promotion link. This makes stale staging links structurally impossible.

-- ─── STEP 1: Add new column on StagingSet ────────────────────────────────────

ALTER TABLE "staging_set" ADD COLUMN "archiveFolderId" TEXT;
CREATE UNIQUE INDEX "staging_set_archiveFolderId_key" ON "staging_set"("archiveFolderId");
CREATE INDEX "staging_set_archiveFolderId_idx" ON "staging_set"("archiveFolderId");
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_archiveFolderId_fkey"
  FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── STEP 2: Resolve conflicts ───────────────────────────────────────────────
-- For PROMOTED staging sets with multiple archive folders linked (e.g. "Keeper" + "Early Riser"
-- both pointing to the same staging set), clear the extra links keeping only the first
-- alphabetically by folder_name.

WITH ranked AS (
  SELECT af.id AS folder_id, af."linkedStagingId",
    ROW_NUMBER() OVER (PARTITION BY af."linkedStagingId" ORDER BY af."folderName") AS rn,
    COUNT(*) OVER (PARTITION BY af."linkedStagingId") AS cnt
  FROM archive_folder af
  JOIN staging_set ss ON af."linkedStagingId" = ss.id
  WHERE ss.status = 'PROMOTED'
)
UPDATE archive_folder
SET "linkedStagingId" = NULL
FROM ranked
WHERE archive_folder.id = ranked.folder_id AND ranked.cnt > 1 AND ranked.rn > 1;

-- ─── STEP 3: Migrate PROMOTED staging set links → Set links ──────────────────

UPDATE archive_folder af
SET "linkedSetId" = ss."promotedSetId"
FROM staging_set ss
WHERE af."linkedStagingId" = ss.id
  AND ss.status = 'PROMOTED'
  AND ss."promotedSetId" IS NOT NULL
  AND af."linkedSetId" IS NULL;

-- ─── STEP 4: Populate StagingSet.archiveFolderId for PROMOTED sets (history) ─

UPDATE staging_set ss
SET "archiveFolderId" = af.id
FROM archive_folder af
WHERE af."linkedStagingId" = ss.id
  AND ss.status = 'PROMOTED';

-- ─── STEP 5: Populate StagingSet.archiveFolderId for non-PROMOTED sets ───────

UPDATE staging_set ss
SET "archiveFolderId" = af.id
FROM archive_folder af
WHERE af."linkedStagingId" = ss.id
  AND ss.status != 'PROMOTED';

-- ─── STEP 6: Drop old column ─────────────────────────────────────────────────

DROP INDEX IF EXISTS "archive_folder_linkedStagingId_idx";
ALTER TABLE "archive_folder" DROP COLUMN "linkedStagingId";

-- ─── STEP 7: Remove pre-existing archiveKey DB default (now client-generated) ─

ALTER TABLE "archive_folder" ALTER COLUMN "archiveKey" DROP DEFAULT;
