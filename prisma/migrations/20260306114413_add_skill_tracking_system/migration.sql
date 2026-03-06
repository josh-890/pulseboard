-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL', 'EXPERT');

-- CreateEnum
CREATE TYPE "SkillEventType" AS ENUM ('ACQUIRED', 'IMPROVED', 'DEMONSTRATED', 'RETIRED');

-- AlterTable: Add skillDefinitionId column
ALTER TABLE "PersonSkill" ADD COLUMN "skillDefinitionId" TEXT;

-- Migrate level: rename old column, add new typed column, migrate data, drop old
ALTER TABLE "PersonSkill" RENAME COLUMN "level" TO "level_old";
ALTER TABLE "PersonSkill" ADD COLUMN "level" "SkillLevel";
UPDATE "PersonSkill" SET "level" = CASE LOWER("level_old")
  WHEN 'beginner' THEN 'BEGINNER'::"SkillLevel"
  WHEN 'intermediate' THEN 'INTERMEDIATE'::"SkillLevel"
  WHEN 'advanced' THEN 'ADVANCED'::"SkillLevel"
  WHEN 'professional' THEN 'PROFESSIONAL'::"SkillLevel"
  WHEN 'expert' THEN 'EXPERT'::"SkillLevel"
  ELSE NULL
END WHERE "level_old" IS NOT NULL;
ALTER TABLE "PersonSkill" DROP COLUMN "level_old";

-- CreateTable
CREATE TABLE "SkillGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillDefinition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonSkillEvent" (
    "id" TEXT NOT NULL,
    "personSkillId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "eventType" "SkillEventType" NOT NULL,
    "level" "SkillLevel",
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonSkillEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipantSkill" (
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "skillDefinitionId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionParticipantSkill_pkey" PRIMARY KEY ("sessionId","personId","skillDefinitionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillGroup_name_key" ON "SkillGroup"("name");

-- CreateIndex
CREATE INDEX "SkillGroup_sortOrder_idx" ON "SkillGroup"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDefinition_slug_key" ON "SkillDefinition"("slug");

-- CreateIndex
CREATE INDEX "SkillDefinition_groupId_idx" ON "SkillDefinition"("groupId");

-- CreateIndex
CREATE INDEX "SkillDefinition_sortOrder_idx" ON "SkillDefinition"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDefinition_groupId_name_key" ON "SkillDefinition"("groupId", "name");

-- CreateIndex
CREATE INDEX "PersonSkillEvent_personSkillId_idx" ON "PersonSkillEvent"("personSkillId");

-- CreateIndex
CREATE INDEX "PersonSkillEvent_personaId_idx" ON "PersonSkillEvent"("personaId");

-- CreateIndex
CREATE INDEX "PersonSkillEvent_deletedAt_idx" ON "PersonSkillEvent"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonSkill_skillDefinitionId_idx" ON "PersonSkill"("skillDefinitionId");

-- AddForeignKey
ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_skillDefinitionId_fkey" FOREIGN KEY ("skillDefinitionId") REFERENCES "SkillDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillDefinition" ADD CONSTRAINT "SkillDefinition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SkillGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSkillEvent" ADD CONSTRAINT "PersonSkillEvent_personSkillId_fkey" FOREIGN KEY ("personSkillId") REFERENCES "PersonSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSkillEvent" ADD CONSTRAINT "PersonSkillEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipantSkill" ADD CONSTRAINT "SessionParticipantSkill_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipantSkill" ADD CONSTRAINT "SessionParticipantSkill_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipantSkill" ADD CONSTRAINT "SessionParticipantSkill_skillDefinitionId_fkey" FOREIGN KEY ("skillDefinitionId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
