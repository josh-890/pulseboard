-- Fix schema drift: columns added via direct SQL but never captured in a migration.
-- This migration is idempotent (IF NOT EXISTS) so it's safe on databases that already have these columns.

-- Person: bio field
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "bio" TEXT;

-- Set: compilation/completeness metadata
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "isCompilation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "isComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "imageCount" INTEGER;
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "videoLength" TEXT;

-- BodyMark/BodyModification/CosmeticProcedure: hero visibility controls
ALTER TABLE "BodyMark" ADD COLUMN IF NOT EXISTS "heroVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BodyMark" ADD COLUMN IF NOT EXISTS "heroOrder" INTEGER;
ALTER TABLE "BodyModification" ADD COLUMN IF NOT EXISTS "heroVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BodyModification" ADD COLUMN IF NOT EXISTS "heroOrder" INTEGER;
ALTER TABLE "CosmeticProcedure" ADD COLUMN IF NOT EXISTS "heroVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CosmeticProcedure" ADD COLUMN IF NOT EXISTS "heroOrder" INTEGER;

-- MediaItem: video source fields
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "sourceVideoRef" TEXT;
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "sourceTimecodeMs" INTEGER;
