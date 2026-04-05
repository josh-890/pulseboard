-- CreateEnum
CREATE TYPE "StagingSetStatus" AS ENUM ('UNRESOLVED', 'MATCHED', 'PROBABLE', 'PROMOTED', 'DUPLICATE', 'REUPLOAD', 'SKIPPED');

-- CreateTable
CREATE TABLE "staging_set" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleNorm" TEXT,
    "externalId" TEXT,
    "channelName" TEXT NOT NULL,
    "channelId" TEXT,
    "releaseDate" TIMESTAMP(3),
    "releaseDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "imageCount" INTEGER,
    "artist" TEXT,
    "artistNorm" TEXT,
    "coverImageUrl" TEXT,
    "description" TEXT,
    "participants" JSONB,
    "participantIcgIds" TEXT[],
    "importBatchId" TEXT NOT NULL,
    "importItemId" TEXT,
    "subjectPersonId" TEXT,
    "subjectIcgId" TEXT NOT NULL,
    "matchedSetId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchDetails" TEXT,
    "status" "StagingSetStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "promotedSetId" TEXT,
    "duplicateGroupId" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "isReupload" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_set_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staging_set_importItemId_key" ON "staging_set"("importItemId");

-- CreateIndex
CREATE INDEX "staging_set_externalId_idx" ON "staging_set"("externalId");

-- CreateIndex
CREATE INDEX "staging_set_channelId_idx" ON "staging_set"("channelId");

-- CreateIndex
CREATE INDEX "staging_set_channelName_idx" ON "staging_set"("channelName");

-- CreateIndex
CREATE INDEX "staging_set_subjectPersonId_idx" ON "staging_set"("subjectPersonId");

-- CreateIndex
CREATE INDEX "staging_set_subjectIcgId_idx" ON "staging_set"("subjectIcgId");

-- CreateIndex
CREATE INDEX "staging_set_titleNorm_idx" ON "staging_set"("titleNorm");

-- CreateIndex
CREATE INDEX "staging_set_artistNorm_idx" ON "staging_set"("artistNorm");

-- CreateIndex
CREATE INDEX "staging_set_importBatchId_idx" ON "staging_set"("importBatchId");

-- CreateIndex
CREATE INDEX "staging_set_status_idx" ON "staging_set"("status");

-- CreateIndex
CREATE INDEX "staging_set_duplicateGroupId_idx" ON "staging_set"("duplicateGroupId");

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "import_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_matchedSetId_fkey" FOREIGN KEY ("matchedSetId") REFERENCES "Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_promotedSetId_fkey" FOREIGN KEY ("promotedSetId") REFERENCES "Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
