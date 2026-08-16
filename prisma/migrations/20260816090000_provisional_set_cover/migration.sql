-- A cover nobody chose.
--
-- Promotion carries the staged set's cover into the Set as a MediaItem, and the
-- auto-assign rule ("cover it if the set has none") then makes it the cover for
-- good. For a set born in the archive that cover is a 512 px thumbnail; the
-- full-size images uploaded afterwards never take the place, because it is no
-- longer empty. The flag records that the cover was handed over rather than
-- picked, so a real upload may replace it — and an explicit pick clears it.
ALTER TABLE "Set" ADD COLUMN "coverIsProvisional" BOOLEAN NOT NULL DEFAULT false;
