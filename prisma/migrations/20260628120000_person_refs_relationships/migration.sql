-- CreateEnum
CREATE TYPE "PersonRefSource" AS ENUM ('import', 'manual');

-- CreateTable
CREATE TABLE "RelationshipRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "inverseName" TEXT NOT NULL,
    "isSymmetric" BOOLEAN NOT NULL DEFAULT false,
    "category" "RelationshipType" NOT NULL DEFAULT 'other',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipRole_slug_key" ON "RelationshipRole"("slug");
CREATE INDEX "RelationshipRole_category_idx" ON "RelationshipRole"("category");

-- CreateTable
CREATE TABLE "PersonRef" (
    "id" TEXT NOT NULL,
    "icgId" TEXT,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT,
    "thumbUrl" TEXT,
    "note" TEXT,
    "source" "PersonRefSource" NOT NULL DEFAULT 'import',
    "ignoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonRef_icgId_key" ON "PersonRef"("icgId");
CREATE INDEX "PersonRef_nameNorm_idx" ON "PersonRef"("nameNorm");
CREATE INDEX "PersonRef_ignoredAt_idx" ON "PersonRef"("ignoredAt");

-- CreateTable
CREATE TABLE "ClaimedCollaboration" (
    "id" TEXT NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "counterpartPersonId" TEXT,
    "counterpartRefId" TEXT,
    "sourceLabel" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimedCollaboration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimedCollaboration_subjectPersonId_counterpartPersonId_key" ON "ClaimedCollaboration"("subjectPersonId", "counterpartPersonId");
CREATE UNIQUE INDEX "ClaimedCollaboration_subjectPersonId_counterpartRefId_key" ON "ClaimedCollaboration"("subjectPersonId", "counterpartRefId");
CREATE INDEX "ClaimedCollaboration_subjectPersonId_idx" ON "ClaimedCollaboration"("subjectPersonId");
CREATE INDEX "ClaimedCollaboration_counterpartPersonId_idx" ON "ClaimedCollaboration"("counterpartPersonId");
CREATE INDEX "ClaimedCollaboration_counterpartRefId_idx" ON "ClaimedCollaboration"("counterpartRefId");

-- Rework PersonRelationship (table is empty across all tenants — no data migration).
ALTER TABLE "PersonRelationship" DROP CONSTRAINT IF EXISTS "PersonRelationship_personAId_fkey";
ALTER TABLE "PersonRelationship" DROP CONSTRAINT IF EXISTS "PersonRelationship_personBId_fkey";
DROP INDEX IF EXISTS "PersonRelationship_personAId_personBId_key";
DROP INDEX IF EXISTS "PersonRelationship_personAId_idx";
DROP INDEX IF EXISTS "PersonRelationship_personBId_idx";

ALTER TABLE "PersonRelationship" DROP COLUMN IF EXISTS "personAId";
ALTER TABLE "PersonRelationship" DROP COLUMN IF EXISTS "personBId";
ALTER TABLE "PersonRelationship" DROP COLUMN IF EXISTS "type";
ALTER TABLE "PersonRelationship" DROP COLUMN IF EXISTS "sharedSetCount";

ALTER TABLE "PersonRelationship" ADD COLUMN "personId" TEXT NOT NULL;
ALTER TABLE "PersonRelationship" ADD COLUMN "toPersonId" TEXT;
ALTER TABLE "PersonRelationship" ADD COLUMN "toRefId" TEXT;
ALTER TABLE "PersonRelationship" ADD COLUMN "roleId" TEXT NOT NULL;
ALTER TABLE "PersonRelationship" ALTER COLUMN "source" SET DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelationship_personId_toPersonId_roleId_key" ON "PersonRelationship"("personId", "toPersonId", "roleId");
CREATE UNIQUE INDEX "PersonRelationship_personId_toRefId_roleId_key" ON "PersonRelationship"("personId", "toRefId", "roleId");
CREATE INDEX "PersonRelationship_personId_idx" ON "PersonRelationship"("personId");
CREATE INDEX "PersonRelationship_toPersonId_idx" ON "PersonRelationship"("toPersonId");
CREATE INDEX "PersonRelationship_toRefId_idx" ON "PersonRelationship"("toRefId");
CREATE INDEX "PersonRelationship_roleId_idx" ON "PersonRelationship"("roleId");

-- AddForeignKey
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_toRefId_fkey" FOREIGN KEY ("toRefId") REFERENCES "PersonRef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RelationshipRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimedCollaboration" ADD CONSTRAINT "ClaimedCollaboration_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimedCollaboration" ADD CONSTRAINT "ClaimedCollaboration_counterpartPersonId_fkey" FOREIGN KEY ("counterpartPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimedCollaboration" ADD CONSTRAINT "ClaimedCollaboration_counterpartRefId_fkey" FOREIGN KEY ("counterpartRefId") REFERENCES "PersonRef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
