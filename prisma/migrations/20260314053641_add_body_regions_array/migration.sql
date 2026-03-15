-- AlterTable
ALTER TABLE "BodyMark" ADD COLUMN     "bodyRegions" TEXT[];

-- AlterTable
ALTER TABLE "BodyModification" ADD COLUMN     "bodyRegions" TEXT[];

-- AlterTable
ALTER TABLE "CosmeticProcedure" ADD COLUMN     "bodyRegions" TEXT[];

-- AlterTable
ALTER TABLE "PersonMediaLink" ADD COLUMN     "bodyRegions" TEXT[];

-- CreateIndex
CREATE INDEX "BodyMark_bodyRegions_idx" ON "BodyMark" USING GIN ("bodyRegions");

-- CreateIndex
CREATE INDEX "BodyModification_bodyRegions_idx" ON "BodyModification" USING GIN ("bodyRegions");

-- CreateIndex
CREATE INDEX "CosmeticProcedure_bodyRegions_idx" ON "CosmeticProcedure" USING GIN ("bodyRegions");
