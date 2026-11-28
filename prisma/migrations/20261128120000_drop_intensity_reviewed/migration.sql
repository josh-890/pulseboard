-- No confirming any more (ADR-0036, amendment 2026-11-28): a tick is the rating.
-- Nothing reads or writes the review state since 9020c7d.
ALTER TABLE "SessionContribution" DROP COLUMN IF EXISTS "intensityReviewedAt";
