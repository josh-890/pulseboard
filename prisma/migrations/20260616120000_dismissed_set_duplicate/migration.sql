-- "Not a duplicate" dismissals for the Sets potential-duplicate detector.
-- One row per unordered pair (setIdA < setIdB), excluded from detection. Cascades
-- away if either set is deleted.

CREATE TABLE "DismissedSetDuplicate" (
  "id" TEXT NOT NULL,
  "setIdA" TEXT NOT NULL,
  "setIdB" TEXT NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DismissedSetDuplicate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DismissedSetDuplicate_setIdA_setIdB_key" ON "DismissedSetDuplicate"("setIdA", "setIdB");
CREATE INDEX "DismissedSetDuplicate_setIdB_idx" ON "DismissedSetDuplicate"("setIdB");

ALTER TABLE "DismissedSetDuplicate"
  ADD CONSTRAINT "DismissedSetDuplicate_setIdA_fkey" FOREIGN KEY ("setIdA") REFERENCES "Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedSetDuplicate"
  ADD CONSTRAINT "DismissedSetDuplicate_setIdB_fkey" FOREIGN KEY ("setIdB") REFERENCES "Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
