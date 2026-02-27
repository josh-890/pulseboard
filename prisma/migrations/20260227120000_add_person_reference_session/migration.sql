-- AlterTable
ALTER TABLE "Session" ADD COLUMN "personId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_personId_key" ON "Session"("personId");

-- CreateIndex
CREATE INDEX "Session_personId_idx" ON "Session"("personId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
