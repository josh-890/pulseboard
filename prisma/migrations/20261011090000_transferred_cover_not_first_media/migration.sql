-- The staging cover copied into a set at promotion (cover-transfer.ts, filename
-- 'cover.jpg') is not "an upload": it must not take the set out of the archive
-- upload agent's queue. Mark it, let the trigger ignore it, and repair the sets
-- whose only image is that cover. Also: the trigger wrote local time into a
-- timestamp-without-zone column that holds UTC everywhere else.
ALTER TABLE "MediaItem" ADD COLUMN "isTransferredCover" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MediaItem" mi SET "isTransferredCover" = true
WHERE mi.filename = 'cover.jpg'
  AND EXISTS (SELECT 1 FROM "SetMediaItem" smi WHERE smi."mediaItemId" = mi.id);

CREATE OR REPLACE FUNCTION set_first_media_at() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MediaItem" WHERE id = NEW."mediaItemId" AND "isTransferredCover") THEN
    RETURN NEW;
  END IF;
  UPDATE "Set" SET "firstMediaAt" = (now() AT TIME ZONE 'UTC')
  WHERE id = NEW."setId" AND "firstMediaAt" IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recompute from what the sets hold: the first image that is not the transferred
-- cover; none → never filled. (Sets the agent already started keep their value.)
UPDATE "Set" s SET "firstMediaAt" = (
  SELECT min(mi."createdAt") FROM "SetMediaItem" smi
  JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
  WHERE smi."setId" = s.id AND NOT mi."isTransferredCover")
WHERE s."archiveUploadStartedAt" IS NULL;
