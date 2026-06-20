-- ADR-0019 slice 3: the single "target" collection for one-key quick-add.
ALTER TABLE "MediaCollection" ADD COLUMN "isTarget" BOOLEAN NOT NULL DEFAULT false;
