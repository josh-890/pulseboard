-- Phase C3b — drop the legacy "natural" Person physical columns. Their values
-- were migrated to baseline-era ScalarDeltas in Phase C1; everything now reads
-- the folded current state. Kills the "natural vs current" duplication.

-- v_person_list (an unused legacy view) reads naturalHairColor / bodyType.
DROP VIEW IF EXISTS v_person_list CASCADE;

ALTER TABLE "Person" DROP COLUMN "naturalHairColor";
ALTER TABLE "Person" DROP COLUMN "naturalBreastSize";
ALTER TABLE "Person" DROP COLUMN "bodyType";
ALTER TABLE "Person" DROP COLUMN "measurements";
