-- AddColumn: nameFormatOk to archive_folder
ALTER TABLE "archive_folder" ADD COLUMN "nameFormatOk" BOOLEAN NOT NULL DEFAULT true;
