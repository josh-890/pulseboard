-- Migration: Replace five-layer archive state with single ArchiveLink model.
-- Removes archive fields from Set, StagingSet, ArchiveFolder, SetCoherenceSnapshot.
-- Creates ArchiveLink as the canonical archive link record.
--
-- DATA MIGRATION is included inline (before column drops) so prod data is preserved.
-- The data migration INSERTs are idempotent (skip if ArchiveLink already exists for folder).

-- ─── Step 1: Create the new enum and table ───────────────────────────────────

CREATE TYPE "ArchiveLinkStatus" AS ENUM ('SUGGESTED', 'CONFIRMED');

CREATE TABLE "ArchiveLink" (
    "id" TEXT NOT NULL,
    "archiveFolderId" TEXT NOT NULL,
    "setId" TEXT,
    "stagingSetId" TEXT,
    "status" "ArchiveLinkStatus" NOT NULL,
    "confidence" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "archivePath" TEXT,
    "archiveStatus" "ArchiveStatus" NOT NULL DEFAULT 'UNKNOWN',
    "archiveFileCount" INTEGER,
    "archiveFileCountPrev" INTEGER,
    "archiveVideoPresent" BOOLEAN,
    "archiveVideoFiles" TEXT,
    "archiveVideoFilename" TEXT,
    "archiveLastChecked" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "tenant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchiveLink_archiveFolderId_key" ON "ArchiveLink"("archiveFolderId");
CREATE INDEX "ArchiveLink_setId_idx" ON "ArchiveLink"("setId");
CREATE INDEX "ArchiveLink_stagingSetId_idx" ON "ArchiveLink"("stagingSetId");
CREATE INDEX "ArchiveLink_tenant_idx" ON "ArchiveLink"("tenant");

ALTER TABLE "ArchiveLink" ADD CONSTRAINT "ArchiveLink_archiveFolderId_fkey"
  FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchiveLink" ADD CONSTRAINT "ArchiveLink_setId_fkey"
  FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ArchiveLink" ADD CONSTRAINT "ArchiveLink_stagingSetId_fkey"
  FOREIGN KEY ("stagingSetId") REFERENCES "staging_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes (Prisma cannot express these natively)
CREATE UNIQUE INDEX "archive_link_set_confirmed"
  ON "ArchiveLink" ("setId")
  WHERE status = 'CONFIRMED' AND "setId" IS NOT NULL;

CREATE UNIQUE INDEX "archive_link_staging_confirmed"
  ON "ArchiveLink" ("stagingSetId")
  WHERE status = 'CONFIRMED' AND "stagingSetId" IS NOT NULL;

-- ─── Step 2: Data migration (inline, before column drops) ────────────────────
-- Run only if the columns still exist (idempotent for re-runs after column drop).

DO $$
DECLARE
  v_has_linked_set_id BOOLEAN;
  v_tenant TEXT;
BEGIN
  -- Detect if the old columns still exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'archive_folder' AND column_name = 'linkedSetId'
  ) INTO v_has_linked_set_id;

  IF NOT v_has_linked_set_id THEN
    RAISE NOTICE 'Old archive columns already dropped — skipping data migration.';
    RETURN;
  END IF;

  -- Derive tenant from the first archive_folder row (all rows share a tenant)
  SELECT COALESCE(MIN(tenant), 'pulse') INTO v_tenant FROM archive_folder;

  -- Pass 1: CONFIRMED links via ArchiveFolder.linkedSetId
  INSERT INTO "ArchiveLink" (
    "id", "archiveFolderId", "setId", "status", "confirmedAt",
    "archivePath", "archiveStatus", "archiveFileCount", "archiveFileCountPrev",
    "archiveVideoPresent", "archiveVideoFiles", "archiveVideoFilename",
    "archiveLastChecked", "tenant", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    af.id,
    af."linkedSetId",
    'CONFIRMED'::"ArchiveLinkStatus",
    NOW(),
    s."archivePath",
    s."archiveStatus",
    s."archiveFileCount",
    s."archiveFileCountPrev",
    s."archiveVideoPresent",
    s."archiveVideoFiles",
    s."archiveVideoFilename",
    s."archiveLastChecked",
    v_tenant,
    NOW(),
    NOW()
  FROM archive_folder af
  JOIN "Set" s ON s.id = af."linkedSetId"
  WHERE af."linkedSetId" IS NOT NULL
  ON CONFLICT ("archiveFolderId") DO NOTHING;

  RAISE NOTICE 'Pass 1 done: % CONFIRMED set links',
    (SELECT COUNT(*) FROM archive_folder WHERE "linkedSetId" IS NOT NULL);

  -- Pass 2: CONFIRMED links via StagingSet.archiveFolderId (skip if folder already linked)
  INSERT INTO "ArchiveLink" (
    "id", "archiveFolderId", "stagingSetId", "status", "confirmedAt",
    "archivePath", "archiveStatus", "archiveFileCount", "archiveFileCountPrev",
    "archiveVideoPresent", "archiveVideoFiles", "archiveVideoFilename",
    "archiveLastChecked", "tenant", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    ss."archiveFolderId",
    ss.id,
    'CONFIRMED'::"ArchiveLinkStatus",
    NOW(),
    ss."archivePath",
    ss."archiveStatus",
    ss."archiveFileCount",
    ss."archiveFileCountPrev",
    ss."archiveVideoPresent",
    ss."archiveVideoFiles",
    ss."archiveVideoFilename",
    ss."archiveLastChecked",
    v_tenant,
    NOW(),
    NOW()
  FROM staging_set ss
  WHERE ss."archiveFolderId" IS NOT NULL
  ON CONFLICT ("archiveFolderId") DO NOTHING;

  RAISE NOTICE 'Pass 2 done: staging CONFIRMED links inserted where folder not already claimed';

  -- Pass 3: SUGGESTED links via ArchiveFolder.suggestedSetId
  INSERT INTO "ArchiveLink" (
    "id", "archiveFolderId", "setId", "status", "confidence",
    "tenant", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    af.id,
    af."suggestedSetId",
    'SUGGESTED'::"ArchiveLinkStatus",
    af."suggestedConfidence",
    v_tenant,
    NOW(),
    NOW()
  FROM archive_folder af
  WHERE af."suggestedSetId" IS NOT NULL
  ON CONFLICT ("archiveFolderId") DO NOTHING;

  RAISE NOTICE 'Pass 3 done: SUGGESTED set links';

  -- Pass 4: SUGGESTED links via ArchiveFolder.suggestedStagingId
  INSERT INTO "ArchiveLink" (
    "id", "archiveFolderId", "stagingSetId", "status", "confidence",
    "tenant", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    af.id,
    af."suggestedStagingId",
    'SUGGESTED'::"ArchiveLinkStatus",
    af."suggestedConfidence",
    v_tenant,
    NOW(),
    NOW()
  FROM archive_folder af
  WHERE af."suggestedStagingId" IS NOT NULL
  ON CONFLICT ("archiveFolderId") DO NOTHING;

  RAISE NOTICE 'Pass 4 done: SUGGESTED staging links';

END $$;

-- ─── Step 3: Drop old FK constraints and indexes ─────────────────────────────

ALTER TABLE "archive_folder" DROP CONSTRAINT IF EXISTS "archive_folder_linkedSetId_fkey";
ALTER TABLE "set_coherence_snapshots" DROP CONSTRAINT IF EXISTS "set_coherence_snapshots_archiveFolderId_fkey";
ALTER TABLE "staging_set" DROP CONSTRAINT IF EXISTS "staging_set_archiveFolderId_fkey";

DROP INDEX IF EXISTS "Set_archiveKey_key";
DROP INDEX IF EXISTS "Set_archiveStatus_idx";
DROP INDEX IF EXISTS "archive_folder_linkedSetId_key";
DROP INDEX IF EXISTS "set_coherence_snapshots_archiveFolderId_key";
DROP INDEX IF EXISTS "staging_set_archiveFolderId_idx";
DROP INDEX IF EXISTS "staging_set_archiveFolderId_key";
DROP INDEX IF EXISTS "staging_set_archiveKey_key";
DROP INDEX IF EXISTS "staging_set_archiveStatus_idx";

-- ─── Step 4: Drop old columns ────────────────────────────────────────────────

ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveFileCount";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveFileCountPrev";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveKey";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveLastChecked";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archivePath";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveStatus";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveVideoFilename";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveVideoFiles";
ALTER TABLE "Set" DROP COLUMN IF EXISTS "archiveVideoPresent";

ALTER TABLE "archive_folder" DROP COLUMN IF EXISTS "linkedSetId";
ALTER TABLE "archive_folder" DROP COLUMN IF EXISTS "suggestedConfidence";
ALTER TABLE "archive_folder" DROP COLUMN IF EXISTS "suggestedSetId";
ALTER TABLE "archive_folder" DROP COLUMN IF EXISTS "suggestedStagingId";

ALTER TABLE "set_coherence_snapshots" DROP COLUMN IF EXISTS "archiveFileCount";
ALTER TABLE "set_coherence_snapshots" DROP COLUMN IF EXISTS "archiveFolderId";
ALTER TABLE "set_coherence_snapshots" DROP COLUMN IF EXISTS "archiveStatus";
ALTER TABLE "set_coherence_snapshots" DROP COLUMN IF EXISTS "lastVerifiedAt";

ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveFileCount";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveFileCountPrev";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveFolderId";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveKey";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveLastChecked";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archivePath";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveStatus";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveVideoFilename";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveVideoFiles";
ALTER TABLE "staging_set" DROP COLUMN IF EXISTS "archiveVideoPresent";
