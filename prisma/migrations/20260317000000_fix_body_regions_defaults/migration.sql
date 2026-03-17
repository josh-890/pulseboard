-- Fix bodyRegions column defaults to match schema
ALTER TABLE "BodyMark" ALTER COLUMN "bodyRegions" SET DEFAULT '{}';
ALTER TABLE "BodyModification" ALTER COLUMN "bodyRegions" SET DEFAULT '{}';
ALTER TABLE "CosmeticProcedure" ALTER COLUMN "bodyRegions" SET DEFAULT '{}';
ALTER TABLE "PersonMediaLink" ALTER COLUMN "bodyRegions" SET DEFAULT '{}';
