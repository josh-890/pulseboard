-- CreateTable
CREATE TABLE "media_item_hidden_person" (
    "mediaItemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_item_hidden_person_pkey" PRIMARY KEY ("mediaItemId","personId")
);

-- CreateIndex
CREATE INDEX "media_item_hidden_person_personId_idx" ON "media_item_hidden_person"("personId");

-- AddForeignKey
ALTER TABLE "media_item_hidden_person" ADD CONSTRAINT "media_item_hidden_person_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item_hidden_person" ADD CONSTRAINT "media_item_hidden_person_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
