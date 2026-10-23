-- Extras for some scenarios only (2026-10-23): by default an extra counts in
-- every scenario; these list where it does not — for a group as a whole, for
-- an extra without a group on its own. A new scenario is included by default.
CREATE TABLE "IntensityExtraGroupScenarioOff" (
    "groupId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "IntensityExtraGroupScenarioOff_pkey" PRIMARY KEY ("groupId","scenarioId")
);

CREATE TABLE "IntensityExtraScenarioOff" (
    "extraId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "IntensityExtraScenarioOff_pkey" PRIMARY KEY ("extraId","scenarioId")
);

ALTER TABLE "IntensityExtraGroupScenarioOff" ADD CONSTRAINT "IntensityExtraGroupScenarioOff_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "IntensityExtraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntensityExtraGroupScenarioOff" ADD CONSTRAINT "IntensityExtraGroupScenarioOff_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "IntensityScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntensityExtraScenarioOff" ADD CONSTRAINT "IntensityExtraScenarioOff_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "IntensityExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntensityExtraScenarioOff" ADD CONSTRAINT "IntensityExtraScenarioOff_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "IntensityScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
