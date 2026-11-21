-- Comparable tag examples (ADR-0042, S4): the box around the subject the crop is
-- computed from, kept so a changed framing rule can re-frame every example. Additive.
ALTER TABLE "tag_example" ADD COLUMN "boxX" DOUBLE PRECISION;
ALTER TABLE "tag_example" ADD COLUMN "boxY" DOUBLE PRECISION;
ALTER TABLE "tag_example" ADD COLUMN "boxW" DOUBLE PRECISION;
ALTER TABLE "tag_example" ADD COLUMN "boxH" DOUBLE PRECISION;
