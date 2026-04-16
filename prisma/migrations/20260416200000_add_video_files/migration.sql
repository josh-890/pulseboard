-- Add video file tracking fields to Set
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "archiveVideoFiles" TEXT;
ALTER TABLE "Set" ADD COLUMN IF NOT EXISTS "archiveVideoFilename" TEXT;

-- Add video file tracking fields to StagingSet
ALTER TABLE staging_set ADD COLUMN IF NOT EXISTS "archiveVideoFiles" TEXT;
ALTER TABLE staging_set ADD COLUMN IF NOT EXISTS "archiveVideoFilename" TEXT;

-- Add video files list to ArchiveFolder
ALTER TABLE archive_folder ADD COLUMN IF NOT EXISTS "videoFiles" TEXT;
