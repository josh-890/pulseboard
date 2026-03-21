-- AlterTable: Add observation fields to CosmeticProcedureEvent
ALTER TABLE "CosmeticProcedureEvent" ADD COLUMN "valueBefore" TEXT;
ALTER TABLE "CosmeticProcedureEvent" ADD COLUMN "valueAfter" TEXT;
ALTER TABLE "CosmeticProcedureEvent" ADD COLUMN "unit" TEXT;

-- CreateTable: PhysicalAttributeGroup
CREATE TABLE "PhysicalAttributeGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicalAttributeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PhysicalAttributeDefinition
CREATE TABLE "PhysicalAttributeDefinition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicalAttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PersonaPhysicalAttribute
CREATE TABLE "PersonaPhysicalAttribute" (
    "id" TEXT NOT NULL,
    "personaPhysicalId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PersonaPhysicalAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalAttributeGroup_name_key" ON "PhysicalAttributeGroup"("name");
CREATE INDEX "PhysicalAttributeGroup_sortOrder_idx" ON "PhysicalAttributeGroup"("sortOrder");

CREATE UNIQUE INDEX "PhysicalAttributeDefinition_slug_key" ON "PhysicalAttributeDefinition"("slug");
CREATE UNIQUE INDEX "PhysicalAttributeDefinition_groupId_name_key" ON "PhysicalAttributeDefinition"("groupId", "name");
CREATE INDEX "PhysicalAttributeDefinition_groupId_idx" ON "PhysicalAttributeDefinition"("groupId");
CREATE INDEX "PhysicalAttributeDefinition_sortOrder_idx" ON "PhysicalAttributeDefinition"("sortOrder");

CREATE UNIQUE INDEX "PersonaPhysicalAttribute_personaPhysicalId_attributeDefiniti_key" ON "PersonaPhysicalAttribute"("personaPhysicalId", "attributeDefinitionId");
CREATE INDEX "PersonaPhysicalAttribute_personaPhysicalId_idx" ON "PersonaPhysicalAttribute"("personaPhysicalId");
CREATE INDEX "PersonaPhysicalAttribute_attributeDefinitionId_idx" ON "PersonaPhysicalAttribute"("attributeDefinitionId");

-- AddForeignKey
ALTER TABLE "PhysicalAttributeDefinition" ADD CONSTRAINT "PhysicalAttributeDefinition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PhysicalAttributeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonaPhysicalAttribute" ADD CONSTRAINT "PersonaPhysicalAttribute_personaPhysicalId_fkey" FOREIGN KEY ("personaPhysicalId") REFERENCES "PersonaPhysical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonaPhysicalAttribute" ADD CONSTRAINT "PersonaPhysicalAttribute_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "PhysicalAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
