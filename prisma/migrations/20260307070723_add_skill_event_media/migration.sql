-- CreateTable
CREATE TABLE "SkillEventMedia" (
    "skillEventId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEventMedia_pkey" PRIMARY KEY ("skillEventId","mediaItemId")
);

-- AddForeignKey
ALTER TABLE "SkillEventMedia" ADD CONSTRAINT "SkillEventMedia_skillEventId_fkey" FOREIGN KEY ("skillEventId") REFERENCES "PersonSkillEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEventMedia" ADD CONSTRAINT "SkillEventMedia_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
