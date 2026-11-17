-- Cover art as its own kind of file (ADR-0040, 2026-11-18).
-- A file is a PHOTO or COVER_ART; cover art stays out of the photos unless
-- artInPhotos lets it in. Roles only — nothing is deleted here (duplicates go
-- through the reviewed cleanup page).
CREATE TYPE "MediaRole" AS ENUM ('PHOTO', 'COVER_ART');
ALTER TABLE "MediaItem" ADD COLUMN "role" "MediaRole" NOT NULL DEFAULT 'PHOTO';
ALTER TABLE "MediaItem" ADD COLUMN "artInPhotos" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MediaItem_sessionId_role_idx" ON "MediaItem"("sessionId", "role");

-- The staging cover copied in at promotion
UPDATE "MediaItem" SET "role" = 'COVER_ART' WHERE "isTransferredCover";
-- The cover agent's rule (scripts/archive-cover.ps1): a stem ending in a lone
-- "c" after any non-alphanumeric separator — "Title-c.jpg", "Title - c.jpg" —
-- in a set (the same rule as a set upload, media-service createMediaItemDirect)
UPDATE "MediaItem" mi SET "role" = 'COVER_ART'
 WHERE mi."mediaType" = 'PHOTO' AND mi.filename ~* '(^|[^a-z0-9])c\.(jpe?g|png|webp)$'
   AND EXISTS (SELECT 1 FROM "SetMediaItem" smi WHERE smi."mediaItemId" = mi.id);

-- Never read: being the cover is Set/Session.coverMediaItemId
ALTER TABLE "SetMediaItem" DROP COLUMN "isCover";
