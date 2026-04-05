-- Redefine StagingSetStatus enum: rename values to lifecycle-based statuses
-- UNRESOLVED → PENDING, MATCHED → PENDING, PROBABLE → PENDING
-- PROMOTED stays PROMOTED
-- DUPLICATE → INACTIVE, REUPLOAD → INACTIVE
-- SKIPPED stays SKIPPED

-- Add new enum values first
ALTER TYPE "StagingSetStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "StagingSetStatus" ADD VALUE IF NOT EXISTS 'REVIEWING';
ALTER TYPE "StagingSetStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "StagingSetStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';

-- Migrate existing data to new values
UPDATE "staging_set" SET "status" = 'PENDING' WHERE "status" IN ('UNRESOLVED', 'MATCHED', 'PROBABLE');
UPDATE "staging_set" SET "status" = 'INACTIVE' WHERE "status" IN ('DUPLICATE', 'REUPLOAD');

-- Add priority column to staging_set
ALTER TABLE "staging_set" ADD COLUMN "priority" INTEGER;

-- Add stagingSummary column to import_batch
ALTER TABLE "import_batch" ADD COLUMN "stagingSummary" JSONB;
