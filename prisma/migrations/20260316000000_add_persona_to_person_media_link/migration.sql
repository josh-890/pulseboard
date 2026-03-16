-- AlterTable
ALTER TABLE "PersonMediaLink" ADD COLUMN "personaId" TEXT;

-- CreateIndex
CREATE INDEX "PersonMediaLink_personaId_idx" ON "PersonMediaLink"("personaId");

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
