-- Photos as evidence for an act (ADR-0036, slice 3b): a photo of the session
-- linked to a ticked act of one person there. Goes with the tick and the photo.
CREATE TABLE "ContributionActMedia" (
    "contributionActId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionActMedia_pkey" PRIMARY KEY ("contributionActId", "mediaItemId")
);
CREATE INDEX "ContributionActMedia_mediaItemId_idx" ON "ContributionActMedia"("mediaItemId");
ALTER TABLE "ContributionActMedia" ADD CONSTRAINT "ContributionActMedia_contributionActId_fkey"
    FOREIGN KEY ("contributionActId") REFERENCES "ContributionAct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionActMedia" ADD CONSTRAINT "ContributionActMedia_mediaItemId_fkey"
    FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
