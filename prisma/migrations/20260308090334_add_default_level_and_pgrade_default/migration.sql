-- Backfill NULL pgrade values to 0
UPDATE "SkillDefinition" SET "pgrade" = 0 WHERE "pgrade" IS NULL;

-- AlterTable
ALTER TABLE "SkillDefinition" ADD COLUMN     "defaultLevel" "SkillLevel",
ALTER COLUMN "pgrade" SET NOT NULL,
ALTER COLUMN "pgrade" SET DEFAULT 0;
