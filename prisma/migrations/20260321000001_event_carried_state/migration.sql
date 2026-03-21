-- AlterTable: Add property override fields to BodyMarkEvent
ALTER TABLE "BodyMarkEvent" ADD COLUMN "bodyRegions" TEXT[],
ADD COLUMN "colors" TEXT[],
ADD COLUMN "description" TEXT,
ADD COLUMN "motif" TEXT,
ADD COLUMN "size" TEXT;

-- AlterTable: Add property override fields to BodyModificationEvent
ALTER TABLE "BodyModificationEvent" ADD COLUMN "bodyRegions" TEXT[],
ADD COLUMN "description" TEXT,
ADD COLUMN "gauge" TEXT,
ADD COLUMN "material" TEXT;

-- AlterTable: Add property override fields to CosmeticProcedureEvent
ALTER TABLE "CosmeticProcedureEvent" ADD COLUMN "bodyRegions" TEXT[],
ADD COLUMN "description" TEXT,
ADD COLUMN "provider" TEXT;
