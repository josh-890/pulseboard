-- Intensity on sets (2026-10-24): a set inherits its session's ticked acts;
-- for a session split into several releases, a set can leave an act out.
CREATE TABLE "SetActExclusion" (
    "setId" TEXT NOT NULL,
    "contributionActId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetActExclusion_pkey" PRIMARY KEY ("setId","contributionActId")
);

CREATE INDEX "SetActExclusion_contributionActId_idx" ON "SetActExclusion"("contributionActId");

ALTER TABLE "SetActExclusion" ADD CONSTRAINT "SetActExclusion_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SetActExclusion" ADD CONSTRAINT "SetActExclusion_contributionActId_fkey" FOREIGN KEY ("contributionActId") REFERENCES "ContributionAct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
