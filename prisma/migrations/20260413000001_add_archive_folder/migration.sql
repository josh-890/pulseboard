-- CreateTable
CREATE TABLE "archive_folder" (
    "id" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "relativePath" TEXT,
    "isVideo" BOOLEAN NOT NULL,
    "fileCount" INTEGER,
    "videoPresent" BOOLEAN,
    "folderName" TEXT NOT NULL,
    "parsedDate" TIMESTAMP(3),
    "parsedShortName" TEXT,
    "parsedTitle" TEXT,
    "linkedSetId" TEXT,
    "linkedStagingId" TEXT,
    "suggestedSetId" TEXT,
    "suggestedStagingId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "tenant" TEXT NOT NULL,

    CONSTRAINT "archive_folder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "archive_folder_fullPath_key" ON "archive_folder"("fullPath");

-- CreateIndex
CREATE INDEX "archive_folder_folderName_idx" ON "archive_folder"("folderName");

-- CreateIndex
CREATE INDEX "archive_folder_parsedDate_parsedShortName_idx" ON "archive_folder"("parsedDate", "parsedShortName");

-- CreateIndex
CREATE INDEX "archive_folder_linkedSetId_idx" ON "archive_folder"("linkedSetId");

-- CreateIndex
CREATE INDEX "archive_folder_linkedStagingId_idx" ON "archive_folder"("linkedStagingId");

-- CreateIndex
CREATE INDEX "archive_folder_tenant_idx" ON "archive_folder"("tenant");
