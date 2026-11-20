-- Color or black & white per photo (ADR-0041, 2026-11-20). Additive: the values
-- are measured at upload and filled for existing photos by
-- scripts/backfill-media-tone.ts. Null = not measured yet.
CREATE TYPE "MediaTone" AS ENUM ('COLOR', 'MONO');
ALTER TABLE "MediaItem" ADD COLUMN "tone" "MediaTone";
ALTER TABLE "MediaItem" ADD COLUMN "chroma" DOUBLE PRECISION;
ALTER TABLE "MediaItem" ADD COLUMN "toneIsManual" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MediaItem_tone_idx" ON "MediaItem"("tone");
