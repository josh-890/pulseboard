-- AlterTable
ALTER TABLE "tag_definition" ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "tag_group" ADD COLUMN     "isExclusive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tag_alias" (
    "id" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_alias_slug_key" ON "tag_alias"("slug");

-- CreateIndex
CREATE INDEX "tag_alias_tagDefinitionId_idx" ON "tag_alias"("tagDefinitionId");

-- CreateIndex
CREATE INDEX "tag_alias_nameNorm_idx" ON "tag_alias"("nameNorm");

-- CreateIndex
CREATE INDEX "tag_definition_status_idx" ON "tag_definition"("status");

-- AddForeignKey
ALTER TABLE "tag_alias" ADD CONSTRAINT "tag_alias_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
