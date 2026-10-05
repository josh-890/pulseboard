-- Archive folder tags (ADR-0034): a folder carries its own tags before it is
-- promoted to a Set, mirrored on disk as `.pulseboard\#name` markers and kept in
-- step by a per-tag three-way reconciliation (the ADR-0032 STUB rule).
ALTER TABLE "archive_folder"
  ADD COLUMN "tagsDiskSeen"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tagsDiskState"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "tagMarkersUnknown"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "tagMarkersConflicts" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "archive_folder_tag" (
    "archiveFolderId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_folder_tag_pkey" PRIMARY KEY ("archiveFolderId","tagDefinitionId")
);

CREATE INDEX "archive_folder_tag_tagDefinitionId_idx" ON "archive_folder_tag"("tagDefinitionId");

ALTER TABLE "archive_folder_tag" ADD CONSTRAINT "archive_folder_tag_archiveFolderId_fkey"
  FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_folder_tag" ADD CONSTRAINT "archive_folder_tag_tagDefinitionId_fkey"
  FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
