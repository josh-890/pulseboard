-- Add missingOnDisk flag to archive_folder
-- true = last full scan did not find this path on disk (ghost folder)
ALTER TABLE "archive_folder" ADD COLUMN "missingOnDisk" BOOLEAN NOT NULL DEFAULT false;

-- Add linkedSet relation (FK already exists as linkedSetId, just needs formal FK constraint)
-- Note: linkedSetId already exists as a column; this adds the FK constraint to "Set"
ALTER TABLE "archive_folder" ADD CONSTRAINT "archive_folder_linkedSetId_fkey"
  FOREIGN KEY ("linkedSetId") REFERENCES "Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
