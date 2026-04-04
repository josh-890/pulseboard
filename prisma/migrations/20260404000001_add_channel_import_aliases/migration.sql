-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "importAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
