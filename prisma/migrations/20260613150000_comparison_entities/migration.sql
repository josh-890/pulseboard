-- ADR-0015: a before/after (SIDE_BY_SIDE) collection contains Comparison entities
-- (ordered 2…N member photos), not flat photos. Adds Comparison + ComparisonItem,
-- then wraps each existing SIDE_BY_SIDE collection's loose items into one Comparison
-- so no curated data is lost.

CREATE TYPE "ComparisonFitMode" AS ENUM ('COVER', 'CONTAIN');

CREATE TABLE "Comparison" (
  "id"                      TEXT NOT NULL,
  "collectionId"            TEXT NOT NULL,
  "sortOrder"               INTEGER NOT NULL DEFAULT 0,
  "aspectDriverMediaItemId" TEXT,
  "fitMode"                 "ComparisonFitMode" NOT NULL DEFAULT 'COVER',
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comparison_collectionId_idx" ON "Comparison" ("collectionId");

ALTER TABLE "Comparison"
  ADD CONSTRAINT "Comparison_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "MediaCollection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ComparisonItem" (
  "comparisonId" TEXT NOT NULL,
  "mediaItemId"  TEXT NOT NULL,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "focalX"       DOUBLE PRECISION,
  "focalY"       DOUBLE PRECISION,
  CONSTRAINT "ComparisonItem_pkey" PRIMARY KEY ("comparisonId", "mediaItemId")
);

CREATE INDEX "ComparisonItem_mediaItemId_idx" ON "ComparisonItem" ("mediaItemId");

ALTER TABLE "ComparisonItem"
  ADD CONSTRAINT "ComparisonItem_comparisonId_fkey"
    FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComparisonItem"
  ADD CONSTRAINT "ComparisonItem_mediaItemId_fkey"
    FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Data migration: wrap existing flat SIDE_BY_SIDE items into one Comparison ──
-- One Comparison per SIDE_BY_SIDE collection that currently has loose items.
INSERT INTO "Comparison" ("id", "collectionId", "sortOrder", "fitMode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 0, 'COVER', now(), now()
FROM "MediaCollection" c
WHERE c."layout" = 'SIDE_BY_SIDE'
  AND EXISTS (SELECT 1 FROM "MediaCollectionItem" mci WHERE mci."collectionId" = c."id");

-- Move those collections' items into the new Comparison (order preserved).
INSERT INTO "ComparisonItem" ("comparisonId", "mediaItemId", "sortOrder")
SELECT cmp."id", mci."mediaItemId", mci."sortOrder"
FROM "MediaCollectionItem" mci
JOIN "MediaCollection" c ON c."id" = mci."collectionId" AND c."layout" = 'SIDE_BY_SIDE'
JOIN "Comparison" cmp ON cmp."collectionId" = c."id";

-- Drop the now-migrated flat items from SIDE_BY_SIDE collections.
DELETE FROM "MediaCollectionItem" mci
USING "MediaCollection" c
WHERE mci."collectionId" = c."id" AND c."layout" = 'SIDE_BY_SIDE';
