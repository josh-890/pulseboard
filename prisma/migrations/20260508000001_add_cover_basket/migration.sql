-- CreateEnum
CREATE TYPE "CoverBasketItemStatus" AS ENUM ('PENDING', 'MATCHED', 'TRANSFERRED', 'IGNORED');

-- CreateTable
CREATE TABLE "cover_basket" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "isVideo" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cover_basket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_basket_item" (
    "id" TEXT NOT NULL,
    "basketId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "minioKey" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "CoverBasketItemStatus" NOT NULL DEFAULT 'PENDING',
    "matchedSetId" TEXT,
    "transferredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cover_basket_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cover_basket_personId_isVideo_key" ON "cover_basket"("personId", "isVideo");

-- CreateIndex
CREATE INDEX "cover_basket_item_basketId_idx" ON "cover_basket_item"("basketId");

-- CreateIndex
CREATE INDEX "cover_basket_item_matchedSetId_idx" ON "cover_basket_item"("matchedSetId");

-- CreateIndex
CREATE INDEX "cover_basket_item_status_idx" ON "cover_basket_item"("status");

-- AddForeignKey
ALTER TABLE "cover_basket" ADD CONSTRAINT "cover_basket_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_basket_item" ADD CONSTRAINT "cover_basket_item_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "cover_basket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_basket_item" ADD CONSTRAINT "cover_basket_item_matchedSetId_fkey" FOREIGN KEY ("matchedSetId") REFERENCES "staging_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
