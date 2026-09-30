-- Stub archive folders (ADR-0032).
--
-- A folder filed on purpose as a placeholder — few media or a low-quality copy —
-- to be upgraded in place later. The flag lives on the folder, not the Set: the
-- publication is complete, the copy is not. stubDiskState remembers what
-- .pulseboard\STUB said at the last reconciliation so either side may change it.
CREATE TYPE "StubReason" AS ENUM ('FEW_MEDIA', 'LOW_QUALITY', 'BOTH');

ALTER TABLE "archive_folder"
  ADD COLUMN "stubSince"     TIMESTAMP(3),
  ADD COLUMN "stubReason"    "StubReason",
  ADD COLUMN "stubNote"      TEXT,
  ADD COLUMN "stubDiskState" BOOLEAN,
  ADD COLUMN "stubEndedAt"   TIMESTAMP(3);

CREATE INDEX "archive_folder_stubSince_idx" ON "archive_folder" ("stubSince") WHERE "stubSince" IS NOT NULL;
