-- ADR-0034: remember whose tags (the folder's, or a Set's) the disk state was
-- reconciled against, so an owner change unites instead of deleting markers.
ALTER TABLE "archive_folder" ADD COLUMN "tagsSyncedOwner" TEXT;
