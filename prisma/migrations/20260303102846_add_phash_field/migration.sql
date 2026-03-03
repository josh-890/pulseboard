-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "phash" TEXT;

-- CreateIndex
CREATE INDEX "MediaItem_phash_idx" ON "MediaItem"("phash");
