-- ADR-0038 S7: covers on request. The app records which staged set wants its
-- cover from the catalogue; the scheduled agent delivers it (or says it is not there).
CREATE TABLE "catalogue_cover_request" (
    "stagingSetId" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    -- Catalogue folders to look in: the subject's first, then the rest of the cast
    "folderPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    -- "develop" | "review" | "opened"
    "reason" TEXT NOT NULL,
    -- "WANTED" | "DELIVERED" | "NOT_FOUND" | "FAILED"
    "status" TEXT NOT NULL DEFAULT 'WANTED',
    "detail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "catalogue_cover_request_pkey" PRIMARY KEY ("stagingSetId")
);

CREATE INDEX "catalogue_cover_request_status_idx" ON "catalogue_cover_request"("status");

ALTER TABLE "catalogue_cover_request" ADD CONSTRAINT "catalogue_cover_request_stagingSetId_fkey"
  FOREIGN KEY ("stagingSetId") REFERENCES "staging_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
