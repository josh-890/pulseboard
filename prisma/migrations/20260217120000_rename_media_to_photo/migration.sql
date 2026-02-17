-- Rename table
ALTER TABLE "Media" RENAME TO "Photo";

-- Rename width/height → originalWidth/originalHeight and make non-nullable
ALTER TABLE "Photo" RENAME COLUMN "width" TO "originalWidth";
ALTER TABLE "Photo" RENAME COLUMN "height" TO "originalHeight";

-- Set defaults for any null width/height values before making non-nullable
UPDATE "Photo" SET "originalWidth" = 0 WHERE "originalWidth" IS NULL;
UPDATE "Photo" SET "originalHeight" = 0 WHERE "originalHeight" IS NULL;

ALTER TABLE "Photo" ALTER COLUMN "originalWidth" SET NOT NULL;
ALTER TABLE "Photo" ALTER COLUMN "originalHeight" SET NOT NULL;

-- Add variants JSON column, populated from old key columns
ALTER TABLE "Photo" ADD COLUMN "variants" JSONB;

UPDATE "Photo" SET "variants" = jsonb_build_object(
  'original', "keyOriginal",
  'profile_128', NULL,
  'profile_256', NULL,
  'profile_512', NULL,
  'profile_768', NULL,
  'gallery_512', "keySmall",
  'gallery_1024', "keyMedium",
  'gallery_1600', NULL
);

ALTER TABLE "Photo" ALTER COLUMN "variants" SET NOT NULL;

-- Drop old key columns
ALTER TABLE "Photo" DROP COLUMN "keyOriginal";
ALTER TABLE "Photo" DROP COLUMN "keyThumbnail";
ALTER TABLE "Photo" DROP COLUMN "keySmall";
ALTER TABLE "Photo" DROP COLUMN "keyMedium";

-- Add new columns
ALTER TABLE "Photo" ADD COLUMN "tags" TEXT[] DEFAULT '{}';
ALTER TABLE "Photo" ADD COLUMN "linkedEntityType" TEXT;
ALTER TABLE "Photo" ADD COLUMN "linkedEntityId" TEXT;

-- Add GIN index on tags
CREATE INDEX "Photo_tags_idx" ON "Photo" USING GIN ("tags");
