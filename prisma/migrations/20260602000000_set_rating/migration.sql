-- Subjective star rating on Set, mirroring Person.rating. 1-5 scale,
-- nullable for unrated. Surfaced on the set detail page hero (5-star
-- widget) and as a multi-select filter on the /sets browser. The same
-- filter is added to /people in this slice; Person.rating already
-- exists.

ALTER TABLE "Set" ADD COLUMN "rating" INTEGER;
