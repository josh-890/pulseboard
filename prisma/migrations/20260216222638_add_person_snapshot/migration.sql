-- CreateTable
CREATE TABLE "PersonSnapshot" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "activeTraits" JSONB NOT NULL,
    "removedTraits" JSONB NOT NULL,
    "personaCount" INTEGER NOT NULL,
    "latestPersonaDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonSnapshot_personId_key" ON "PersonSnapshot"("personId");

-- CreateIndex
CREATE INDEX "PersonSnapshot_jobTitle_idx" ON "PersonSnapshot"("jobTitle");

-- CreateIndex
CREATE INDEX "PersonSnapshot_department_idx" ON "PersonSnapshot"("department");

-- CreateIndex
CREATE INDEX "PersonSnapshot_deletedAt_idx" ON "PersonSnapshot"("deletedAt");

-- AddForeignKey
ALTER TABLE "PersonSnapshot" ADD CONSTRAINT "PersonSnapshot_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
