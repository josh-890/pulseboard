-- Archive cover thumbnails (implementation plan slice 1).
--
-- The archive workspace is text-only today, which makes judging 32k orphan
-- folders guesswork. The scan agent picks a cover per folder (`*-c.jpg`, else
-- the first image), downscales it locally and POSTs only the thumbnail.
--
-- coverError is deliberately a stored column rather than a log line: a corrupt
-- image must fail exactly one folder and stay individually visible and fixable.
-- It also drives retry scoping — a re-run only revisits folders with no cover or
-- a recorded error, so fixing one file never redoes all 34,662.

ALTER TABLE "archive_folder"
    ADD COLUMN "coverKey"       TEXT,
    ADD COLUMN "coverError"     TEXT,
    ADD COLUMN "coverCheckedAt" TIMESTAMP(3);

-- Partial index for the agent worklist: folders still needing a cover attempt.
CREATE INDEX "archive_folder_cover_pending_idx"
    ON "archive_folder" ("tenant")
    WHERE "coverKey" IS NULL;
