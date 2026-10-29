-- ADR-0038 S6: the Person hint — what a newer catalogue file of a developed
-- Person would bring (new sets, changed values), worked out when it arrives.
ALTER TABLE "catalogue_folder" ADD COLUMN "hint" JSONB;
-- The file the hint was worked out for; differs from "fileKey" → stale
ALTER TABLE "catalogue_folder" ADD COLUMN "hintFileKey" TEXT;
