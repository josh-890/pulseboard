-- ADR-0009 Phase 2: re-import decision history + manual-deletion tombstones.
--
-- ImportDeclineLog: written when a user clicks Decline on a relation row in
-- the re-import review (Phase 2 only logs alias rows — scalars are explicitly
-- NOT logged per the hair-colour-cycling carve-out in ADR-0009, and digital
-- identities go through their own SKIP path, not a per-row Decline).
--
-- ItemDeletionTombstone: written when the user manually deletes an alias or
-- digital identity from the person detail page, in the same $transaction as
-- the delete. Lets a future re-import surface "previously manually deleted"
-- context on the matching review row so the user isn't silently re-creating
-- something they tore down.
--
-- Both tables cascade-delete from Person (a hard-deleted person has no
-- meaningful history to preserve).

CREATE TABLE "import_decline_log" (
  "id"                TEXT NOT NULL,
  "personId"          TEXT NOT NULL,
  "kind"              TEXT NOT NULL,
  "itemKey"           TEXT NOT NULL,
  "declinedInBatchId" TEXT NOT NULL,
  "declinedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_decline_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_decline_log_person_kind_idx" ON "import_decline_log" ("personId", "kind");
CREATE INDEX "import_decline_log_declinedAt_idx"  ON "import_decline_log" ("declinedAt");

ALTER TABLE "import_decline_log" ADD CONSTRAINT "import_decline_log_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_decline_log" ADD CONSTRAINT "import_decline_log_declinedInBatchId_fkey"
  FOREIGN KEY ("declinedInBatchId") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "item_deletion_tombstone" (
  "id"        TEXT NOT NULL,
  "personId"  TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "itemKey"   TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_deletion_tombstone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "item_deletion_tombstone_person_kind_idx" ON "item_deletion_tombstone" ("personId", "kind");
CREATE INDEX "item_deletion_tombstone_deletedAt_idx"   ON "item_deletion_tombstone" ("deletedAt");

ALTER TABLE "item_deletion_tombstone" ADD CONSTRAINT "item_deletion_tombstone_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
