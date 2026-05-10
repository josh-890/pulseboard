-- Add isAvatar column to PersonMediaLink
ALTER TABLE "PersonMediaLink" ADD COLUMN "isAvatar" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark isAvatar=true on the first HEADSHOT per person
-- (mirrors the old getHeadshotsForPersons sort: slot ASC NULLS LAST, sortOrder ASC)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "personId"
      ORDER BY slot ASC NULLS LAST, "sortOrder" ASC, "createdAt" ASC
    ) AS rn
  FROM "PersonMediaLink"
  WHERE usage = 'HEADSHOT' AND slot IS NOT NULL
)
UPDATE "PersonMediaLink" SET "isAvatar" = true
WHERE id IN (SELECT id FROM ranked WHERE rn = 1);
