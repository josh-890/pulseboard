-- Brand mark for channels, labels and artists: an uploaded logo (or portrait)
-- wins; otherwise a generated wordmark, with optional font/colour overrides.
ALTER TABLE "Channel" ADD COLUMN "logoKey" TEXT, ADD COLUMN "markFont" TEXT, ADD COLUMN "markColor" TEXT;
ALTER TABLE "Label" ADD COLUMN "logoKey" TEXT, ADD COLUMN "markFont" TEXT, ADD COLUMN "markColor" TEXT;
ALTER TABLE "Artist" ADD COLUMN "logoKey" TEXT, ADD COLUMN "markFont" TEXT, ADD COLUMN "markColor" TEXT;
