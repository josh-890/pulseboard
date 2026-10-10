-- Archive upload agent (2026-10-10): remember that a set ever received images,
-- and the agent's own progress per set.
ALTER TABLE "Set" ADD COLUMN "firstMediaAt" TIMESTAMP(3);
ALTER TABLE "Set" ADD COLUMN "archiveUploadStartedAt" TIMESTAMP(3);
ALTER TABLE "Set" ADD COLUMN "archiveUploadDoneAt" TIMESTAMP(3);
ALTER TABLE "Set" ADD COLUMN "archiveUploadFailed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Every set that has images now has had them
UPDATE "Set" s SET "firstMediaAt" = COALESCE(
  (SELECT min(mi."createdAt") FROM "SetMediaItem" smi JOIN "MediaItem" mi ON mi.id = smi."mediaItemId" WHERE smi."setId" = s.id),
  now())
WHERE EXISTS (SELECT 1 FROM "SetMediaItem" smi WHERE smi."setId" = s.id);

-- Any route that links a first image to a set (upload, agent, copy, merge) sets it
CREATE OR REPLACE FUNCTION set_first_media_at() RETURNS trigger AS $$
BEGIN
  UPDATE "Set" SET "firstMediaAt" = now() WHERE id = NEW."setId" AND "firstMediaAt" IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_media_item_first_media
AFTER INSERT ON "SetMediaItem"
FOR EACH ROW EXECUTE FUNCTION set_first_media_at();
