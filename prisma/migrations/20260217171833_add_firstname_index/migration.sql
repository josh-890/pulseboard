-- AlterTable
ALTER TABLE "Photo" RENAME CONSTRAINT "Media_pkey" TO "Photo_pkey";
ALTER TABLE "Photo" ALTER COLUMN "tags" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Person_firstName_lastName_idx" ON "Person"("firstName", "lastName");

-- RenameIndex
ALTER INDEX "Media_deletedAt_idx" RENAME TO "Photo_deletedAt_idx";

-- RenameIndex
ALTER INDEX "Media_entityType_entityId_idx" RENAME TO "Photo_entityType_entityId_idx";

-- RenameIndex
ALTER INDEX "Media_entityType_entityId_isFavorite_idx" RENAME TO "Photo_entityType_entityId_isFavorite_idx";
