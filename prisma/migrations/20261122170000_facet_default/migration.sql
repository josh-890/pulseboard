-- ADR-0043: a facet's level where no context on the photo has a say
-- (the seat is asked only when a base posture asks for it)
ALTER TABLE "tag_group" ADD COLUMN "composerDefault" "RelevanceLevel" NOT NULL DEFAULT 'POSSIBLE';
