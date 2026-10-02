-- Saved filters (ADR-0033, S6): the browsers' saved views move from
-- localStorage into the DB, and scope "media" rows are Smart Collections —
-- an image tag query evaluated live.
CREATE TABLE "saved_filter" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_filter_scope_name_key" ON "saved_filter"("scope", "name");
CREATE INDEX "saved_filter_scope_idx" ON "saved_filter"("scope");
