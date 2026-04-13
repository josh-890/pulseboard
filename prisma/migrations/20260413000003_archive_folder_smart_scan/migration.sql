-- AlterTable
ALTER TABLE "archive_folder" ADD COLUMN     "chanFolderModifiedAt" TIMESTAMP(3),
ADD COLUMN     "contentSignature" TEXT,
ADD COLUMN     "lastRenamedAt" TIMESTAMP(3),
ADD COLUMN     "lastRenamedFrom" TEXT,
ADD COLUMN     "leafDirModifiedAt" TIMESTAMP(3),
ADD COLUMN     "yearDirModifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "archive_folder_contentSignature_idx" ON "archive_folder"("contentSignature");
