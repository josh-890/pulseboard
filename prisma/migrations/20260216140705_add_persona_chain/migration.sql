-- CreateEnum
CREATE TYPE "TraitAction" AS ENUM ('add', 'remove');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthdate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TraitCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TraitCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sequenceNum" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaTrait" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "traitCategoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" "TraitAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonaTrait_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraitCategory_name_key" ON "TraitCategory"("name");

-- CreateIndex
CREATE INDEX "TraitCategory_name_idx" ON "TraitCategory"("name");

-- CreateIndex
CREATE INDEX "TraitCategory_deletedAt_idx" ON "TraitCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "Persona_personId_effectiveDate_idx" ON "Persona"("personId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Persona_personId_sequenceNum_idx" ON "Persona"("personId", "sequenceNum");

-- CreateIndex
CREATE INDEX "Persona_deletedAt_idx" ON "Persona"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_personId_sequenceNum_key" ON "Persona"("personId", "sequenceNum");

-- CreateIndex
CREATE INDEX "PersonaTrait_personaId_idx" ON "PersonaTrait"("personaId");

-- CreateIndex
CREATE INDEX "PersonaTrait_traitCategoryId_name_idx" ON "PersonaTrait"("traitCategoryId", "name");

-- CreateIndex
CREATE INDEX "PersonaTrait_deletedAt_idx" ON "PersonaTrait"("deletedAt");

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaTrait" ADD CONSTRAINT "PersonaTrait_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaTrait" ADD CONSTRAINT "PersonaTrait_traitCategoryId_fkey" FOREIGN KEY ("traitCategoryId") REFERENCES "TraitCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
