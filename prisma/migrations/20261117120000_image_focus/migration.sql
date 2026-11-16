-- Per-image focus (ADR-0039, 2026-11-17): in the shot, not the focus.
-- A lead in the shot only; and a person only appearing marked as the focus.
-- Additive: no rows = everything as before.
CREATE TABLE "media_item_background_person" (
    "mediaItemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_item_background_person_pkey" PRIMARY KEY ("mediaItemId", "personId")
);
CREATE INDEX "media_item_background_person_personId_idx" ON "media_item_background_person"("personId");
ALTER TABLE "media_item_background_person" ADD CONSTRAINT "media_item_background_person_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_item_background_person" ADD CONSTRAINT "media_item_background_person_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_item_shown_person" ADD COLUMN "focus" BOOLEAN NOT NULL DEFAULT false;
