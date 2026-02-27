-- AlterTable
ALTER TABLE "PersonMediaLink" ADD COLUMN     "bodyMarkId" TEXT,
ADD COLUMN     "bodyModificationId" TEXT,
ADD COLUMN     "bodyRegion" TEXT,
ADD COLUMN     "cosmeticProcedureId" TEXT,
ADD COLUMN     "slot" INTEGER;

-- CreateIndex
CREATE INDEX "PersonMediaLink_bodyMarkId_idx" ON "PersonMediaLink"("bodyMarkId");

-- CreateIndex
CREATE INDEX "PersonMediaLink_bodyModificationId_idx" ON "PersonMediaLink"("bodyModificationId");

-- CreateIndex
CREATE INDEX "PersonMediaLink_cosmeticProcedureId_idx" ON "PersonMediaLink"("cosmeticProcedureId");

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_bodyMarkId_fkey" FOREIGN KEY ("bodyMarkId") REFERENCES "BodyMark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_bodyModificationId_fkey" FOREIGN KEY ("bodyModificationId") REFERENCES "BodyModification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_cosmeticProcedureId_fkey" FOREIGN KEY ("cosmeticProcedureId") REFERENCES "CosmeticProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
