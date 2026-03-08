-- DropForeignKey
ALTER TABLE "PersonSkillEvent" DROP CONSTRAINT "PersonSkillEvent_personaId_fkey";

-- AlterTable
ALTER TABLE "PersonSkillEvent" ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ALTER COLUMN "personaId" DROP NOT NULL;

-- Backfill: copy persona date into skill event date
UPDATE "PersonSkillEvent" e
SET "date" = p."date", "datePrecision" = p."datePrecision"
FROM "Persona" p
WHERE e."personaId" = p."id" AND p."date" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "PersonSkillEvent" ADD CONSTRAINT "PersonSkillEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
