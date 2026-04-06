-- Add participantNamesNorm for text search on participant names
ALTER TABLE "staging_set" ADD COLUMN "participantNamesNorm" TEXT;

-- Backfill from JSON participants field: extract all "name" values, lowercase, join with ", "
UPDATE "staging_set"
SET "participantNamesNorm" = (
  SELECT lower(string_agg(elem->>'name', ', '))
  FROM jsonb_array_elements("participants"::jsonb) AS elem
  WHERE elem->>'name' IS NOT NULL
)
WHERE "participants" IS NOT NULL;

-- Index for search performance
CREATE INDEX "staging_set_participantNamesNorm_idx" ON "staging_set"("participantNamesNorm");
