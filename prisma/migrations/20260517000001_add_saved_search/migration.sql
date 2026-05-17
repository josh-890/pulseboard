-- SavedSearch: user-defined named filter specs (people search, future: sets/media)
CREATE TABLE "saved_search" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "filterSpec" JSONB NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_search_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_search_scope_pinned_idx" ON "saved_search"("scope", "pinned");
