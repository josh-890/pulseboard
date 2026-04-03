-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PARSING', 'REVIEW', 'IMPORTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('NEW', 'MATCHED', 'PROBABLE', 'BLOCKED', 'QUEUED', 'IMPORTING', 'IMPORTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportItemType" AS ENUM ('PERSON', 'PERSON_ALIAS', 'DIGITAL_IDENTITY', 'CHANNEL', 'LABEL', 'SET', 'CO_MODEL', 'CREDIT');

-- AlterTable
ALTER TABLE "Set" ADD COLUMN "externalId" TEXT;

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "subjectIcgId" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PARSING',
    "rawContent" TEXT NOT NULL,
    "parsedAt" TIMESTAMP(3),
    "notes" TEXT,
    "extractionDate" TIMESTAMP(3),
    "previousBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_item" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "ImportItemType" NOT NULL,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'NEW',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "rawText" TEXT,
    "matchedEntityId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchDetails" TEXT,
    "dependsOn" TEXT[],
    "blockedReason" TEXT,
    "editedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batch_subjectIcgId_idx" ON "import_batch"("subjectIcgId");

-- CreateIndex
CREATE INDEX "import_item_batchId_type_idx" ON "import_item"("batchId", "type");

-- CreateIndex
CREATE INDEX "import_item_batchId_status_idx" ON "import_item"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Set_externalId_key" ON "Set"("externalId");

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_previousBatchId_fkey" FOREIGN KEY ("previousBatchId") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_item" ADD CONSTRAINT "import_item_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
