-- AddColumn: chanFolderName to archive_folder
ALTER TABLE "archive_folder" ADD COLUMN "chanFolderName" TEXT;

-- Backfill from fullPath: extract 3rd-from-last path segment (chanFolder level)
UPDATE "archive_folder"
SET "chanFolderName" = (
  SELECT arr[array_length(arr, 1) - 2]
  FROM (
    SELECT regexp_split_to_array(regexp_replace("fullPath", '[/\\]+$', ''), '[/\\]') AS arr
  ) t
);

CREATE INDEX "archive_folder_chanFolderName_idx" ON "archive_folder"("chanFolderName");
