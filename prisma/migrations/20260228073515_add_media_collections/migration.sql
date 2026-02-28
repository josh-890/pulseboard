-- CreateTable
CREATE TABLE "MediaCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCollectionItem" (
    "collectionId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCollectionItem_pkey" PRIMARY KEY ("collectionId","mediaItemId")
);

-- CreateIndex
CREATE INDEX "MediaCollection_personId_idx" ON "MediaCollection"("personId");

-- CreateIndex
CREATE INDEX "MediaCollection_deletedAt_idx" ON "MediaCollection"("deletedAt");

-- AddForeignKey
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollectionItem" ADD CONSTRAINT "MediaCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MediaCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollectionItem" ADD CONSTRAINT "MediaCollectionItem_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
