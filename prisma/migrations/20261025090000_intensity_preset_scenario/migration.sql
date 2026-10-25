-- A preset is for one scenario (2026-10-25): its acts are that scenario's, its extras those counting there.
-- Existing presets take the scenario most of their acts are in (Solo when they have none), and keep only
-- the acts of that scenario.

ALTER TABLE "IntensityPreset" ADD COLUMN "scenarioId" TEXT;

UPDATE "IntensityPreset" p SET "scenarioId" = COALESCE(
  (SELECT a."scenarioId" FROM "IntensityPresetAct" pa JOIN "IntensityAct" a ON a.id = pa."actId"
    WHERE pa."presetId" = p.id GROUP BY a."scenarioId" ORDER BY count(*) DESC, a."scenarioId" LIMIT 1),
  (SELECT id FROM "IntensityScenario" ORDER BY "sortOrder" LIMIT 1)
);

DELETE FROM "IntensityPresetAct" pa USING "IntensityAct" a, "IntensityPreset" p
  WHERE a.id = pa."actId" AND p.id = pa."presetId" AND a."scenarioId" <> p."scenarioId";

ALTER TABLE "IntensityPreset" ALTER COLUMN "scenarioId" SET NOT NULL;
DROP INDEX "IntensityPreset_name_key";
CREATE UNIQUE INDEX "IntensityPreset_scenarioId_name_key" ON "IntensityPreset"("scenarioId", "name");
CREATE INDEX "IntensityPreset_scenarioId_idx" ON "IntensityPreset"("scenarioId");
ALTER TABLE "IntensityPreset" ADD CONSTRAINT "IntensityPreset_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "IntensityScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
