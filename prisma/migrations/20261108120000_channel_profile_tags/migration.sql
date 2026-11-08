-- Channel page (2026-11-08): your rating (tier stays: a different scale), a short
-- profile, a closed flag; tags on channels, labels and artists.
ALTER TABLE "Channel" ADD COLUMN "rating" INTEGER, ADD COLUMN "profile" TEXT, ADD COLUMN "closed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "channel_tag" (
    "channelId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_tag_pkey" PRIMARY KEY ("channelId","tagDefinitionId")
);
CREATE INDEX "channel_tag_tagDefinitionId_idx" ON "channel_tag"("tagDefinitionId");
ALTER TABLE "channel_tag" ADD CONSTRAINT "channel_tag_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_tag" ADD CONSTRAINT "channel_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "label_tag" (
    "labelId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "label_tag_pkey" PRIMARY KEY ("labelId","tagDefinitionId")
);
CREATE INDEX "label_tag_tagDefinitionId_idx" ON "label_tag"("tagDefinitionId");
ALTER TABLE "label_tag" ADD CONSTRAINT "label_tag_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "label_tag" ADD CONSTRAINT "label_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "artist_tag" (
    "artistId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artist_tag_pkey" PRIMARY KEY ("artistId","tagDefinitionId")
);
CREATE INDEX "artist_tag_tagDefinitionId_idx" ON "artist_tag"("tagDefinitionId");
ALTER TABLE "artist_tag" ADD CONSTRAINT "artist_tag_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artist_tag" ADD CONSTRAINT "artist_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
