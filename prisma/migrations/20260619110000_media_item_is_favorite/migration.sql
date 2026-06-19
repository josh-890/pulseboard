-- ADR-0019: global per-image favorite flag.
-- Add MediaItem.isFavorite and backfill from the (now-deprecated) per-person
-- PersonMediaLink.isFavorite — any image favorited for any person becomes a
-- global favorite. PersonMediaLink.isFavorite is left in place but unread.

ALTER TABLE "MediaItem" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MediaItem" SET "isFavorite" = true
WHERE id IN (SELECT DISTINCT "mediaItemId" FROM "PersonMediaLink" WHERE "isFavorite" = true);

CREATE INDEX "MediaItem_isFavorite_idx" ON "MediaItem" ("isFavorite");
