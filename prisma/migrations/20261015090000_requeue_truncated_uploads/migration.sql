-- Images over 10 MB reached the archive upload route cut off (the middleware's
-- default body limit) and were stored as "damaged". Re-queue every set the agent
-- filled that still holds a flagged image: the next run replaces each flagged
-- copy with the full file from the archive (same file name, see
-- archive-upload-service). Images already cleared ("Looks fine") or replaced by
-- hand carry no flag and are left alone.
UPDATE "Set" SET "archiveUploadDoneAt" = NULL
WHERE "archiveUploadStartedAt" IS NOT NULL AND "archiveUploadDoneAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "SetMediaItem" smi JOIN "MediaItem" m ON m.id = smi."mediaItemId"
    WHERE smi."setId" = "Set".id AND m."decodeIssue" IS NOT NULL
  );
