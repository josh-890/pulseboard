-- Group confirmation (ADR-0027, plan slice 5).
--
-- Confirmation writes attribution and nothing else: no Set, no StagingSet. Only
-- 1.7% of suggestions point at a Person the app already knows, so materialising
-- in bulk would be mass identity creation rather than linking. Materialisation
-- stays the curated per-person import path.

CREATE TYPE "AttributionDecision" AS ENUM ('CONFIRMED', 'NOT_A_PERSON', 'SKIPPED');

CREATE TABLE "archive_folder_attribution" (
    "id" TEXT NOT NULL,
    "archiveFolderId" TEXT NOT NULL,
    "icgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personId" TEXT,
    "contactId" TEXT,
    "groupKey" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_folder_attribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "archive_folder_attribution_archiveFolderId_icgId_key" ON "archive_folder_attribution"("archiveFolderId", "icgId");
CREATE INDEX "archive_folder_attribution_icgId_idx" ON "archive_folder_attribution"("icgId");
CREATE INDEX "archive_folder_attribution_personId_idx" ON "archive_folder_attribution"("personId");
CREATE INDEX "archive_folder_attribution_contactId_idx" ON "archive_folder_attribution"("contactId");
CREATE INDEX "archive_folder_attribution_groupKey_idx" ON "archive_folder_attribution"("groupKey");

ALTER TABLE "archive_folder_attribution" ADD CONSTRAINT "archive_folder_attribution_archiveFolderId_fkey"
    FOREIGN KEY ("archiveFolderId") REFERENCES "archive_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_folder_attribution" ADD CONSTRAINT "archive_folder_attribution_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "archive_folder_attribution" ADD CONSTRAINT "archive_folder_attribution_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "PersonRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A decision must survive a catalogue re-run: the agent rewrites suggestions
-- wholesale, and a group ruled "not a person" must not come back on the next pass.
CREATE TABLE "attribution_group_decision" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "decision" "AttributionDecision" NOT NULL,
    "icgIds" TEXT[],
    "folderCount" INTEGER NOT NULL,
    "attributedCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_group_decision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribution_group_decision_groupKey_key" ON "attribution_group_decision"("groupKey");
CREATE INDEX "attribution_group_decision_decision_idx" ON "attribution_group_decision"("decision");
