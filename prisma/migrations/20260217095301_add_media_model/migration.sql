-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('person', 'project');

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "keyOriginal" TEXT NOT NULL,
    "keyThumbnail" TEXT,
    "keySmall" TEXT,
    "keyMedium" TEXT,
    "caption" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_entityType_entityId_idx" ON "Media"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Media_entityType_entityId_isFavorite_idx" ON "Media"("entityType", "entityId", "isFavorite");

-- CreateIndex
CREATE INDEX "Media_deletedAt_idx" ON "Media"("deletedAt");
