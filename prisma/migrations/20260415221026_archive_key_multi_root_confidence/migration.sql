-- Add archiveKey to Set: stable sidecar UUID for cross-drive identity
ALTER TABLE "Set" ADD COLUMN "archiveKey" TEXT;
CREATE UNIQUE INDEX "Set_archiveKey_key" ON "Set"("archiveKey");

-- Add archiveKey to staging_set
ALTER TABLE "staging_set" ADD COLUMN "archiveKey" TEXT;
CREATE UNIQUE INDEX "staging_set_archiveKey_key" ON "staging_set"("archiveKey");

-- Add archiveKey and suggestedConfidence to archive_folder
ALTER TABLE "archive_folder" ADD COLUMN "archiveKey" TEXT;
ALTER TABLE "archive_folder" ADD COLUMN "suggestedConfidence" TEXT;
CREATE UNIQUE INDEX "archive_folder_archiveKey_key" ON "archive_folder"("archiveKey");
