-- Create SetCoherenceSnapshot table for cross-bucket coherence tracking
-- One row per logical set entry spanning Active Set + Staging Set + Archive Folder

CREATE TABLE "set_coherence_snapshots" (
    "id"              TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "setId"           TEXT,
    "stagingSetId"    TEXT,
    "archiveFolderId" TEXT,
    "archiveStatus"   TEXT NOT NULL DEFAULT 'NONE',
    "hasMediaInApp"   BOOLEAN NOT NULL DEFAULT false,
    "archiveFileCount" INTEGER,
    "lastVerifiedAt"  TIMESTAMP(3),

    CONSTRAINT "set_coherence_snapshots_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (one snapshot per Set / StagingSet / ArchiveFolder)
CREATE UNIQUE INDEX "set_coherence_snapshots_setId_key"           ON "set_coherence_snapshots"("setId");
CREATE UNIQUE INDEX "set_coherence_snapshots_stagingSetId_key"    ON "set_coherence_snapshots"("stagingSetId");
CREATE UNIQUE INDEX "set_coherence_snapshots_archiveFolderId_key" ON "set_coherence_snapshots"("archiveFolderId");

-- Foreign keys
ALTER TABLE "set_coherence_snapshots"
    ADD CONSTRAINT "set_coherence_snapshots_setId_fkey"
        FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "set_coherence_snapshots"
    ADD CONSTRAINT "set_coherence_snapshots_stagingSetId_fkey"
        FOREIGN KEY ("stagingSetId") REFERENCES "staging_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "set_coherence_snapshots"
    ADD CONSTRAINT "set_coherence_snapshots_archiveFolderId_fkey"
        FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make ArchiveFolder.linkedSetId unique (one folder per set)
-- Drop the old plain index first
DROP INDEX IF EXISTS "archive_folder_linkedSetId_idx";
CREATE UNIQUE INDEX "archive_folder_linkedSetId_key" ON "archive_folder"("linkedSetId");
