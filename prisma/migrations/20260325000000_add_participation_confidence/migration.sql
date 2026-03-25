-- CreateEnum
CREATE TYPE "ParticipationConfidence" AS ENUM ('CONFIRMED', 'PROBABLE', 'POSSIBLE');

-- CreateEnum
CREATE TYPE "ConfidenceSource" AS ENUM ('MANUAL', 'CREDIT_MATCH', 'IMPORT');

-- AlterTable: SessionContribution
ALTER TABLE "SessionContribution" ADD COLUMN "confidence" "ParticipationConfidence" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "SessionContribution" ADD COLUMN "confidenceSource" "ConfidenceSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SessionContribution" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable: SetParticipant
ALTER TABLE "SetParticipant" ADD COLUMN "confidence" "ParticipationConfidence" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "SetParticipant" ADD COLUMN "confidenceSource" "ConfidenceSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SetParticipant" ADD COLUMN "confirmedAt" TIMESTAMP(3);
