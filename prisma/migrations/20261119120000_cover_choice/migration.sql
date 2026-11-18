-- Cover choice (ADR-0040 addendum, 2026-11-19).
-- 1. The set remembers a cover picked by hand: arrivals rank the automatic cover
--    (Title-c first, then Title-c1, -c2 …, then other cover art, then photos) and
--    may replace it, but never one you chose.
ALTER TABLE "Set" ADD COLUMN "coverIsChosen" BOOLEAN NOT NULL DEFAULT false;

-- 2. "Title-c1.jpg", "Title - c2.jpg" … are cover art too, like "Title-c.jpg".
--    Roles only — which file is the cover is reviewed on Settings → System → Cover check.
UPDATE "MediaItem" mi SET "role" = 'COVER_ART'
 WHERE mi.role = 'PHOTO' AND mi."mediaType" = 'PHOTO'
   AND mi.filename ~* '(^|[^a-z0-9])c[0-9]+\.(jpe?g|png|webp)$'
   AND EXISTS (SELECT 1 FROM "SetMediaItem" smi WHERE smi."mediaItemId" = mi.id);
