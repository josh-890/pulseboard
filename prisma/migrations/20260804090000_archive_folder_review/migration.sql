-- Per-folder review state (ADR-0027, plan slice 6).
--
-- The (channel, alias) group is the wrong unit of decision — `AA | Anna` holds
-- several distinct people under one folder alias — so the commit moves to the
-- folder. Identity and development are two separate passes.

CREATE TYPE "FolderIdentityStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED', 'SKIPPED');
CREATE TYPE "FolderDevelopStatus" AS ENUM ('PENDING', 'DEVELOPED', 'WAITING');

CREATE TABLE "archive_folder_review" (
    "id" TEXT NOT NULL,
    "archiveFolderId" TEXT NOT NULL,
    "identity" "FolderIdentityStatus" NOT NULL DEFAULT 'OPEN',
    "develop" "FolderDevelopStatus" NOT NULL DEFAULT 'PENDING',
    "identityAt" TIMESTAMP(3),
    "developAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_folder_review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "archive_folder_review_archiveFolderId_key" ON "archive_folder_review"("archiveFolderId");
CREATE INDEX "archive_folder_review_identity_idx" ON "archive_folder_review"("identity");
CREATE INDEX "archive_folder_review_develop_idx" ON "archive_folder_review"("develop");

ALTER TABLE "archive_folder_review" ADD CONSTRAINT "archive_folder_review_archiveFolderId_fkey"
    FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: work already done under the group-level flow must survive. Every
-- folder that already carries an attribution is a folder someone confirmed, and
-- without this it would reappear in the open queue as if untouched.
INSERT INTO "archive_folder_review" ("id", "archiveFolderId", "identity", "develop", "identityAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    a."archiveFolderId",
    'CONFIRMED'::"FolderIdentityStatus",
    'PENDING'::"FolderDevelopStatus",
    MIN(a."confirmedAt"),
    NOW()
FROM "archive_folder_attribution" a
GROUP BY a."archiveFolderId";

-- A folder already linked to a staging set was developed by some other path;
-- the develop queue must not offer it again.
UPDATE "archive_folder_review" r
SET "develop" = 'DEVELOPED'::"FolderDevelopStatus", "developAt" = NOW()
FROM "ArchiveLink" l
WHERE l."archiveFolderId" = r."archiveFolderId" AND l."stagingSetId" IS NOT NULL;
