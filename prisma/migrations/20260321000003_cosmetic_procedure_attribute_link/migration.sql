-- AlterTable: Add optional FK from CosmeticProcedure to PhysicalAttributeDefinition
ALTER TABLE "CosmeticProcedure" ADD COLUMN "attributeDefinitionId" TEXT;

-- AddForeignKey
ALTER TABLE "CosmeticProcedure" ADD CONSTRAINT "CosmeticProcedure_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "PhysicalAttributeDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CosmeticProcedure_attributeDefinitionId_idx" ON "CosmeticProcedure"("attributeDefinitionId");
