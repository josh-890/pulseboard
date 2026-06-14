-- ADR-0017 slice 1: record which source resolution an Aligned image was baked from.
-- MASTER = the in-app master_4000 downscale (every existing aligned bake);
-- ORIGINAL = the full-res archive original (set by a future HD re-bake).
-- Null = not an Aligned image. Drives the HD-re-bake eligibility worklist.

CREATE TYPE "BakeSource" AS ENUM ('MASTER', 'ORIGINAL');

ALTER TABLE "MediaItem" ADD COLUMN "bakeSource" "BakeSource";

-- Every existing Aligned image was baked client-side from the master_4000.
UPDATE "MediaItem" SET "bakeSource" = 'MASTER' WHERE "motifTemplateId" IS NOT NULL;
