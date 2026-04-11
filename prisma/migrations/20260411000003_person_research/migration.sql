-- CreateTable
CREATE TABLE "PersonResearch" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonResearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonResearch_personId_idx" ON "PersonResearch"("personId");

-- AddForeignKey
ALTER TABLE "PersonResearch" ADD CONSTRAINT "PersonResearch_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
