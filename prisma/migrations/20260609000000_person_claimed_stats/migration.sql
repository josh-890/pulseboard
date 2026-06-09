-- Claimed catalogue size parsed from the imported biography. Covers is derived
-- (photosets + videos), never stored. claimedStatsUserSet guards manual edits
-- against re-import overwrite.
ALTER TABLE "Person" ADD COLUMN "claimedPhotosets" INTEGER;
ALTER TABLE "Person" ADD COLUMN "claimedVideos" INTEGER;
ALTER TABLE "Person" ADD COLUMN "claimedStatsUserSet" BOOLEAN NOT NULL DEFAULT false;
