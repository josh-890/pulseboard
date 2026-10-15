-- An archive image whose copy arrived incomplete stays visible (decoded as far as
-- it goes, red frame) and is fetched again by every agent run until complete.
ALTER TABLE "MediaItem" ADD COLUMN "archiveRetry" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MediaItem_archiveRetry_idx" ON "MediaItem"("archiveRetry");

-- The images cut off by the 10 MB middleware body limit (2026-10-15): flagged,
-- stored at just under 10 MB, in sets the agent filled. Mark them for re-fetch and
-- say what happened instead of Sharp's "premature end of JPEG image".
UPDATE "MediaItem" m SET "archiveRetry" = true,
  "decodeIssue" = 'Arrived incomplete (cut off at 10 MB on the way) — the next archive upload run fetches it again'
WHERE m."decodeIssue" IS NOT NULL
  AND m.size BETWEEN 10400000 AND 10485760
  AND EXISTS (
    SELECT 1 FROM "SetMediaItem" smi JOIN "Set" s ON s.id = smi."setId"
    WHERE smi."mediaItemId" = m.id AND s."archiveUploadStartedAt" IS NOT NULL
  );
