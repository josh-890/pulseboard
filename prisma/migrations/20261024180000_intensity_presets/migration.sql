-- Intensity presets (2026-10-24): a bundle of acts and session extras; ticks remember their preset;
-- a contribution's intensity can be confirmed as reviewed.

CREATE TABLE "IntensityPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityPreset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityPreset_name_key" ON "IntensityPreset"("name");

CREATE TABLE "IntensityPresetAct" (
    "presetId" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    CONSTRAINT "IntensityPresetAct_pkey" PRIMARY KEY ("presetId", "actId")
);
CREATE INDEX "IntensityPresetAct_actId_idx" ON "IntensityPresetAct"("actId");
ALTER TABLE "IntensityPresetAct" ADD CONSTRAINT "IntensityPresetAct_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "IntensityPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntensityPresetAct" ADD CONSTRAINT "IntensityPresetAct_actId_fkey" FOREIGN KEY ("actId") REFERENCES "IntensityAct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntensityPresetExtra" (
    "presetId" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    CONSTRAINT "IntensityPresetExtra_pkey" PRIMARY KEY ("presetId", "extraId")
);
CREATE INDEX "IntensityPresetExtra_extraId_idx" ON "IntensityPresetExtra"("extraId");
ALTER TABLE "IntensityPresetExtra" ADD CONSTRAINT "IntensityPresetExtra_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "IntensityPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntensityPresetExtra" ADD CONSTRAINT "IntensityPresetExtra_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "IntensityExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContributionAct" ADD COLUMN "presetId" TEXT;
ALTER TABLE "ContributionAct" ADD CONSTRAINT "ContributionAct_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "IntensityPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionContribution" ADD COLUMN "intensityReviewedAt" TIMESTAMP(3);
