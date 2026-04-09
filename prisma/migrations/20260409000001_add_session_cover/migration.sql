-- AddColumn: Session.coverMediaItemId
ALTER TABLE "Session" ADD COLUMN "coverMediaItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_coverMediaItemId_fkey"
  FOREIGN KEY ("coverMediaItemId") REFERENCES "MediaItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Session_coverMediaItemId_idx" ON "Session"("coverMediaItemId");
