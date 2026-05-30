-- Feature: copy production-set image to person reference session.
--
-- When a user copies an image from a production set into a person's
-- reference session, the new MediaItem records the source via this
-- self-FK so the reference-session UI can later surface a "from
-- [SetName]" badge and link back to the original.
--
-- Nullable: a MediaItem may have no source (the common case — direct
-- uploads, imports). Self-FK + SetNull on delete: removing the source
-- doesn't orphan-delete the copies (they're independent assets) but
-- their breadcrumb to the source is cleared.

ALTER TABLE "MediaItem"
  ADD COLUMN "copiedFromMediaItemId" TEXT;

ALTER TABLE "MediaItem"
  ADD CONSTRAINT "MediaItem_copiedFromMediaItemId_fkey"
    FOREIGN KEY ("copiedFromMediaItemId") REFERENCES "MediaItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MediaItem_copiedFromMediaItemId_idx"
  ON "MediaItem" ("copiedFromMediaItemId");
