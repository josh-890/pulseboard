-- AlterEnum
ALTER TYPE "PersonMediaUsage" ADD VALUE 'DETAIL';

-- AlterTable
ALTER TABLE "PersonMediaLink" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "MediaCategoryGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCategoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCategory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "entityModel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaCategoryGroup_name_key" ON "MediaCategoryGroup"("name");

-- CreateIndex
CREATE INDEX "MediaCategoryGroup_sortOrder_idx" ON "MediaCategoryGroup"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCategory_slug_key" ON "MediaCategory"("slug");

-- CreateIndex
CREATE INDEX "MediaCategory_groupId_idx" ON "MediaCategory"("groupId");

-- CreateIndex
CREATE INDEX "MediaCategory_sortOrder_idx" ON "MediaCategory"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCategory_groupId_name_key" ON "MediaCategory"("groupId", "name");

-- CreateIndex
CREATE INDEX "PersonMediaLink_categoryId_idx" ON "PersonMediaLink"("categoryId");

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MediaCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCategory" ADD CONSTRAINT "MediaCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MediaCategoryGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
