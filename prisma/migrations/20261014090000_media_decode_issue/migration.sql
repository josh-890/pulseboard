-- A damaged image file (truncated / corrupt JPEG) is no longer refused: it is
-- decoded leniently, like a browser does, and flagged for a look. NULL = clean.
ALTER TABLE "MediaItem" ADD COLUMN "decodeIssue" TEXT;
CREATE INDEX "MediaItem_decodeIssue_idx" ON "MediaItem"("decodeIssue");

-- Sets whose archive upload left files behind (other than bmp/tif, which stay
-- unsupported) go back into the agent's queue once: the next run sends the
-- folder again, skips what is already in the set and uploads the damaged files
-- with their flag. The run's completion rewrites the failed list.
UPDATE "Set" SET "archiveUploadDoneAt" = NULL
WHERE "archiveUploadStartedAt" IS NOT NULL
  AND "archiveUploadDoneAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest("archiveUploadFailed") AS f
    WHERE f NOT LIKE '%(unsupported type)');
