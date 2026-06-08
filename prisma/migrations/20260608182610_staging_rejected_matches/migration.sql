-- Persistent per-staging-set "not a match" rejections (the matcher skips these).
ALTER TABLE "staging_set" ADD COLUMN "rejectedMatchSetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
