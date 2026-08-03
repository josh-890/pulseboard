-- Attribution suggestions (ADR-0027, plan slice 4).
--
-- A queryable, explainable layer between the catalogue join and the operator.
-- Materialises nothing: confirmation remains the only door into the database.
--
-- The unique key is (folder, person, source) so a re-run of the agent REPLACES
-- its own suggestions rather than accumulating duplicates, while leaving the
-- other sources' rows alone.

CREATE TYPE "SuggestionSource" AS ENUM ('CATALOGUE', 'REGISTRY', 'FOLDER_ATTRIBUTION');
CREATE TYPE "SuggestionTier"   AS ENUM ('EXACT', 'STRONG', 'WEAK');

CREATE TABLE "archive_folder_suggestion" (
    "id"              TEXT NOT NULL,
    "archiveFolderId" TEXT NOT NULL,
    "icgId"           TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "source"          "SuggestionSource" NOT NULL,
    "tier"            "SuggestionTier" NOT NULL,
    "score"           DOUBLE PRECISION NOT NULL,
    -- Why an otherwise-strong suggestion still needs review: CROSS_LABEL,
    -- AMBIGUOUS, DATE_VARIANT. Stored because the evidence is not reproducible
    -- from the app alone — the catalogue lives on another machine.
    "demotions"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "evidence"        JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_folder_suggestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "archive_folder_suggestion"
    ADD CONSTRAINT "archive_folder_suggestion_archiveFolderId_fkey"
    FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "archive_folder_suggestion_folder_icg_source_key"
    ON "archive_folder_suggestion" ("archiveFolderId", "icgId", "source");
CREATE INDEX "archive_folder_suggestion_archiveFolderId_idx" ON "archive_folder_suggestion" ("archiveFolderId");
CREATE INDEX "archive_folder_suggestion_icgId_idx" ON "archive_folder_suggestion" ("icgId");
CREATE INDEX "archive_folder_suggestion_source_tier_idx" ON "archive_folder_suggestion" ("source", "tier");
