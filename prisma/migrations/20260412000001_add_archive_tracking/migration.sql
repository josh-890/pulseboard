-- Add ArchiveStatus enum
CREATE TYPE "ArchiveStatus" AS ENUM ('UNKNOWN', 'PENDING', 'OK', 'CHANGED', 'MISSING', 'INCOMPLETE');

-- Add channelFolder to Channel
ALTER TABLE "Channel" ADD COLUMN "channelFolder" TEXT;

-- Add archive tracking + media queue fields to Set
ALTER TABLE "Set" ADD COLUMN "archivePath" TEXT;
ALTER TABLE "Set" ADD COLUMN "archiveStatus" "ArchiveStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Set" ADD COLUMN "archiveLastChecked" TIMESTAMP(3);
ALTER TABLE "Set" ADD COLUMN "archiveFileCount" INTEGER;
ALTER TABLE "Set" ADD COLUMN "archiveFileCountPrev" INTEGER;
ALTER TABLE "Set" ADD COLUMN "archiveVideoPresent" BOOLEAN;
ALTER TABLE "Set" ADD COLUMN "mediaPriority" INTEGER;
ALTER TABLE "Set" ADD COLUMN "mediaQueueAt" TIMESTAMP(3);

CREATE INDEX "Set_archiveStatus_idx" ON "Set"("archiveStatus");
CREATE INDEX "Set_mediaQueueAt_idx" ON "Set"("mediaQueueAt");

-- Add archive tracking + media queue fields to staging_set
ALTER TABLE "staging_set" ADD COLUMN "archivePath" TEXT;
ALTER TABLE "staging_set" ADD COLUMN "archiveStatus" "ArchiveStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "staging_set" ADD COLUMN "archiveLastChecked" TIMESTAMP(3);
ALTER TABLE "staging_set" ADD COLUMN "archiveFileCount" INTEGER;
ALTER TABLE "staging_set" ADD COLUMN "archiveFileCountPrev" INTEGER;
ALTER TABLE "staging_set" ADD COLUMN "archiveVideoPresent" BOOLEAN;
ALTER TABLE "staging_set" ADD COLUMN "mediaPriority" INTEGER;
ALTER TABLE "staging_set" ADD COLUMN "mediaQueueAt" TIMESTAMP(3);

CREATE INDEX "staging_set_archiveStatus_idx" ON "staging_set"("archiveStatus");
CREATE INDEX "staging_set_mediaQueueAt_idx" ON "staging_set"("mediaQueueAt");
