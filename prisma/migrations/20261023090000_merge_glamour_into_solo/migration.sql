-- Glamour merges into Solo (2026-10-23): the split made no sense. Glamour's acts
-- move to Solo with their ids, so ticks, photo evidence and extras stay. A Glamour
-- act whose name a Solo act already has (ignoring case and outer spaces) joins
-- that act instead: its ticks move over; where the person already has the Solo act
-- ticked in that session, the Solo tick stays and gains the photos.
-- By the seeded ids, so a renamed scenario is still found; no-op where either is gone.

CREATE TEMP TABLE glamour_dup AS
SELECT DISTINCT ON (g.id) g.id AS from_id, s.id AS to_id
FROM "IntensityAct" g
JOIN "IntensityAct" s
  ON s."scenarioId" = 'dsit-solo' AND lower(btrim(s.name)) = lower(btrim(g.name))
WHERE g."scenarioId" = 'dsit-glamour'
ORDER BY g.id, s.id;

-- Same person, same session, both ticked: the photos join the Solo tick
INSERT INTO "ContributionActMedia" ("contributionActId", "mediaItemId", "createdAt")
SELECT keep.id, m."mediaItemId", m."createdAt"
FROM glamour_dup d
JOIN "ContributionAct" dup ON dup."actId" = d.from_id
JOIN "ContributionAct" keep ON keep."actId" = d.to_id AND keep."contributionId" = dup."contributionId"
JOIN "ContributionActMedia" m ON m."contributionActId" = dup.id
ON CONFLICT DO NOTHING;

DELETE FROM "ContributionAct" dup
USING glamour_dup d, "ContributionAct" keep
WHERE dup."actId" = d.from_id AND keep."actId" = d.to_id AND keep."contributionId" = dup."contributionId";

UPDATE "ContributionAct" ca SET "actId" = d.to_id FROM glamour_dup d WHERE ca."actId" = d.from_id;

DELETE FROM "IntensityAct" a USING glamour_dup d WHERE a.id = d.from_id;

DROP TABLE glamour_dup;

-- The rest moves over as it is
UPDATE "IntensityAct" SET "scenarioId" = 'dsit-solo'
WHERE "scenarioId" = 'dsit-glamour' AND EXISTS (SELECT 1 FROM "IntensityScenario" WHERE id = 'dsit-solo');

-- Close the gap in the column order, then drop Glamour (empty by now)
UPDATE "IntensityScenario" SET "sortOrder" = "sortOrder" - 1
WHERE "sortOrder" > (SELECT "sortOrder" FROM "IntensityScenario" WHERE id = 'dsit-glamour')
  AND EXISTS (SELECT 1 FROM "IntensityScenario" WHERE id = 'dsit-solo');

DELETE FROM "IntensityScenario" g
WHERE g.id = 'dsit-glamour' AND NOT EXISTS (SELECT 1 FROM "IntensityAct" a WHERE a."scenarioId" = g.id);
