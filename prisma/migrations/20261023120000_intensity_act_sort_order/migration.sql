-- The catalog as a board (2026-10-23, K1): acts keep a manual order within their
-- cell (scenario × level). Starts as today's order — by name.
ALTER TABLE "IntensityAct" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "IntensityAct" a SET "sortOrder" = o.rn
FROM (
  SELECT id, (row_number() OVER (PARTITION BY "scenarioId", level ORDER BY name)) - 1 AS rn
  FROM "IntensityAct"
) o
WHERE o.id = a.id;
