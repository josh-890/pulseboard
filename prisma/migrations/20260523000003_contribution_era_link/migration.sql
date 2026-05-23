-- Phase F — Era-linked participation (ADR-0004).
-- Additive, non-destructive: SessionContribution gains an optional eraId FK to
-- Era. Drives the appearance-at-shoot snapshot via point-in-time fold. The
-- link is authored on SessionContribution (source-of-truth participation
-- record), NOT on SetParticipant (derived cache). Nullable — imports + legacy
-- rows leave it null.

ALTER TABLE "SessionContribution"
  ADD COLUMN "eraId" TEXT;

ALTER TABLE "SessionContribution"
  ADD CONSTRAINT "SessionContribution_eraId_fkey"
  FOREIGN KEY ("eraId") REFERENCES "Era"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "SessionContribution_eraId_idx" ON "SessionContribution"("eraId");
