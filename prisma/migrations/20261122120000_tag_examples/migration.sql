-- Tag examples (ADR-0042, S4): the user's own photos with a crop, shown as the
-- Composer tile and in the tag's card. Additive.
CREATE TABLE "tag_example" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "cropX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cropY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cropW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "cropH" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isTitle" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_example_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tag_example_tagId_mediaItemId_key" ON "tag_example"("tagId", "mediaItemId");
CREATE INDEX "tag_example_mediaItemId_idx" ON "tag_example"("mediaItemId");
ALTER TABLE "tag_example" ADD CONSTRAINT "tag_example_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_example" ADD CONSTRAINT "tag_example_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
