-- Migrate suggestedStagingId pointing to PROMOTED staging sets → suggestedSetId
-- Run manually: psql pulseboard_dev < this_file
-- Then: npx prisma migrate resolve --applied 20260418000002_repair_stale_archive_suggestions
-- For prod: scripts/deploy-migrations.sh

UPDATE archive_folder af
SET "suggestedSetId" = ss."promotedSetId",
    "suggestedStagingId" = NULL
FROM staging_set ss
WHERE af."suggestedStagingId" = ss.id
  AND ss.status = 'PROMOTED'
  AND ss."promotedSetId" IS NOT NULL;
