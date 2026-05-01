-- DropIndex: remove single-column unique on importItemId
DROP INDEX IF EXISTS "staging_set_importItemId_key";

-- AlterTable: add siblingId column
ALTER TABLE "staging_set" ADD COLUMN "siblingId" TEXT;

-- CreateIndex: unique on siblingId (each staging set can have at most one sibling)
CREATE UNIQUE INDEX "staging_set_siblingId_key" ON "staging_set"("siblingId");

-- CreateIndex: compound unique (importItemId, isVideo) — allows one photo + one video per import item
CREATE UNIQUE INDEX "staging_set_importItemId_isVideo_key" ON "staging_set"("importItemId", "isVideo");

-- AddForeignKey: self-referential sibling link
ALTER TABLE "staging_set" ADD CONSTRAINT "staging_set_siblingId_fkey" FOREIGN KEY ("siblingId") REFERENCES "staging_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
