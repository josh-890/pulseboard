-- CreateEnum
CREATE TYPE "AliasType" AS ENUM ('common', 'birth', 'alias');

-- CreateEnum
CREATE TYPE "BodyMarkType" AS ENUM ('tattoo', 'scar', 'mark', 'burn', 'deformity', 'other');

-- CreateEnum
CREATE TYPE "BodyMarkStatus" AS ENUM ('present', 'modified', 'removed');

-- CreateEnum
CREATE TYPE "BodyMarkEventType" AS ENUM ('added', 'modified', 'removed');

-- AlterTable Person: drop old columns, add new ones
ALTER TABLE "Person" DROP COLUMN "firstName";
ALTER TABLE "Person" DROP COLUMN "lastName";
ALTER TABLE "Person" ADD COLUMN "icgId" TEXT NOT NULL DEFAULT 'TEMP-00000';
ALTER TABLE "Person" ADD COLUMN "sexAtBirth" TEXT;
ALTER TABLE "Person" ADD COLUMN "birthPlace" TEXT;
ALTER TABLE "Person" RENAME COLUMN "hairColor" TO "naturalHairColor";
-- Remove the temporary default
ALTER TABLE "Person" ALTER COLUMN "icgId" DROP DEFAULT;

-- Add unique constraint on icgId
ALTER TABLE "Person" ADD CONSTRAINT "Person_icgId_key" UNIQUE ("icgId");

-- Drop old index that referenced firstName/lastName
DROP INDEX IF EXISTS "Person_lastName_firstName_idx";
DROP INDEX IF EXISTS "Person_firstName_lastName_idx";

-- AlterTable PersonAlias: drop isPrimary, add type
ALTER TABLE "PersonAlias" DROP COLUMN "isPrimary";
ALTER TABLE "PersonAlias" ADD COLUMN "type" "AliasType" NOT NULL DEFAULT 'alias';

-- AlterTable Persona: rename name -> label, drop description, add date
ALTER TABLE "Persona" RENAME COLUMN "name" TO "label";
ALTER TABLE "Persona" DROP COLUMN "description";
ALTER TABLE "Persona" ADD COLUMN "date" TIMESTAMP(3);

-- CreateTable PersonaPhysical
CREATE TABLE "PersonaPhysical" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "currentHairColor" TEXT,
    "build" TEXT,
    "visionAids" TEXT,
    "fitnessLevel" TEXT,

    CONSTRAINT "PersonaPhysical_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonaPhysical_personaId_key" ON "PersonaPhysical"("personaId");

-- CreateTable BodyMark
CREATE TABLE "BodyMark" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "BodyMarkType" NOT NULL,
    "bodyRegion" TEXT NOT NULL,
    "side" TEXT,
    "position" TEXT,
    "description" TEXT,
    "motif" TEXT,
    "colors" TEXT[],
    "size" TEXT,
    "status" "BodyMarkStatus" NOT NULL DEFAULT 'present',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BodyMark_personId_idx" ON "BodyMark"("personId");
CREATE INDEX "BodyMark_status_idx" ON "BodyMark"("status");
CREATE INDEX "BodyMark_deletedAt_idx" ON "BodyMark"("deletedAt");

-- CreateTable BodyMarkEvent
CREATE TABLE "BodyMarkEvent" (
    "id" TEXT NOT NULL,
    "bodyMarkId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "eventType" "BodyMarkEventType" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BodyMarkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BodyMarkEvent_bodyMarkId_idx" ON "BodyMarkEvent"("bodyMarkId");
CREATE INDEX "BodyMarkEvent_personaId_idx" ON "BodyMarkEvent"("personaId");
CREATE INDEX "BodyMarkEvent_deletedAt_idx" ON "BodyMarkEvent"("deletedAt");

-- CreateTable PersonDigitalIdentity
CREATE TABLE "PersonDigitalIdentity" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personaId" TEXT,
    "platform" TEXT NOT NULL,
    "handle" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonDigitalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonDigitalIdentity_personId_idx" ON "PersonDigitalIdentity"("personId");
CREATE INDEX "PersonDigitalIdentity_personaId_idx" ON "PersonDigitalIdentity"("personaId");
CREATE INDEX "PersonDigitalIdentity_deletedAt_idx" ON "PersonDigitalIdentity"("deletedAt");

-- CreateTable PersonSkill
CREATE TABLE "PersonSkill" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personaId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "level" TEXT,
    "evidence" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonSkill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonSkill_personId_idx" ON "PersonSkill"("personId");
CREATE INDEX "PersonSkill_personaId_idx" ON "PersonSkill"("personaId");
CREATE INDEX "PersonSkill_deletedAt_idx" ON "PersonSkill"("deletedAt");

-- AddForeignKey PersonaPhysical -> Persona
ALTER TABLE "PersonaPhysical" ADD CONSTRAINT "PersonaPhysical_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BodyMark -> Person
ALTER TABLE "BodyMark" ADD CONSTRAINT "BodyMark_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BodyMarkEvent -> BodyMark
ALTER TABLE "BodyMarkEvent" ADD CONSTRAINT "BodyMarkEvent_bodyMarkId_fkey" FOREIGN KEY ("bodyMarkId") REFERENCES "BodyMark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BodyMarkEvent -> Persona
ALTER TABLE "BodyMarkEvent" ADD CONSTRAINT "BodyMarkEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey PersonDigitalIdentity -> Person
ALTER TABLE "PersonDigitalIdentity" ADD CONSTRAINT "PersonDigitalIdentity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey PersonDigitalIdentity -> Persona
ALTER TABLE "PersonDigitalIdentity" ADD CONSTRAINT "PersonDigitalIdentity_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey PersonSkill -> Person
ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey PersonSkill -> Persona
ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
