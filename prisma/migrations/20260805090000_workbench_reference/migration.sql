-- Attribution workbench ergonomics.

-- Per-candidate rejection. Rejecting used to close the whole card, answering
-- "not this person" while leaving "then who?" open. Now the candidate is dropped
-- and the card stays; the dismissal must persist or it returns on the next load.
ALTER TABLE "archive_folder_review" ADD COLUMN "rejectedIcgIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Portraits from the person catalogue, keyed on the ICG-ID alone: 4,269 of 5,074
-- suggested identities have neither a Person nor a Contact to hang one off, and
-- those are exactly the ones needing a face to compare against.
CREATE TABLE "catalogue_avatar" (
    "id" TEXT NOT NULL,
    "icgId" TEXT NOT NULL,
    "key" TEXT,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_avatar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalogue_avatar_icgId_key" ON "catalogue_avatar"("icgId");
