-- ADR-0019 slice 4: favorite-person flag (★).
ALTER TABLE "Person" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Person_isFavorite_idx" ON "Person" ("isFavorite");
