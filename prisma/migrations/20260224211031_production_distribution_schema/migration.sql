/*
  Warnings:

  - Added the required column `updatedAt` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Set` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REFERENCE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('MODEL', 'PHOTOGRAPHER');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('UNRESOLVED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('CHANNEL_MAP', 'MANUAL');

-- CreateEnum
CREATE TYPE "PersonMediaUsage" AS ENUM ('PROFILE', 'REFERENCE', 'HEADSHOT', 'BODY_MARK', 'BODY_MODIFICATION', 'COSMETIC_PROCEDURE', 'PORTFOLIO');

-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_labelId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_projectId_fkey";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "nameNorm" TEXT,
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "labelId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Label" ADD COLUMN     "nameNorm" TEXT;

-- AlterTable
ALTER TABLE "Network" ADD COLUMN     "nameNorm" TEXT;

-- AlterTable
ALTER TABLE "PersonAlias" ADD COLUMN     "nameNorm" TEXT,
ADD COLUMN     "source" "AliasSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "labelId" TEXT,
ADD COLUMN     "nameNorm" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "labelId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "projectId" DROP NOT NULL;

-- Add updatedAt to Session with default for existing rows
ALTER TABLE "Session" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Set" ADD COLUMN     "coverMediaItemId" TEXT,
ADD COLUMN     "isCompilation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "titleNorm" TEXT;

-- Add updatedAt to Set with default for existing rows
ALTER TABLE "Set" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ChannelLabelMap" (
    "channelId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLabelMap_pkey" PRIMARY KEY ("channelId","labelId")
);

-- CreateTable
CREATE TABLE "SetLabelEvidence" (
    "setId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetLabelEvidence_pkey" PRIMARY KEY ("setId","labelId","evidenceType")
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "capturedAtPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "filename" TEXT NOT NULL,
    "fileRef" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hash" TEXT,
    "originalWidth" INTEGER NOT NULL,
    "originalHeight" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "variants" JSONB,
    "caption" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetMediaItem" (
    "setId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "notes" TEXT,

    CONSTRAINT "SetMediaItem_pkey" PRIMARY KEY ("setId","mediaItemId")
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "creditNameOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("sessionId","personId","role")
);

-- CreateTable
CREATE TABLE "SetParticipant" (
    "setId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,

    CONSTRAINT "SetParticipant_pkey" PRIMARY KEY ("setId","personId","role")
);

-- CreateTable
CREATE TABLE "SetCreditRaw" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawNameNorm" TEXT,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolvedPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SetCreditRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMediaLink" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "usage" "PersonMediaUsage" NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonMediaLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaItem_sessionId_idx" ON "MediaItem"("sessionId");

-- CreateIndex
CREATE INDEX "MediaItem_hash_idx" ON "MediaItem"("hash");

-- CreateIndex
CREATE INDEX "MediaItem_mediaType_idx" ON "MediaItem"("mediaType");

-- CreateIndex
CREATE INDEX "MediaItem_deletedAt_idx" ON "MediaItem"("deletedAt");

-- CreateIndex
CREATE INDEX "MediaItem_tags_idx" ON "MediaItem" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "SetCreditRaw_setId_idx" ON "SetCreditRaw"("setId");

-- CreateIndex
CREATE INDEX "SetCreditRaw_resolutionStatus_idx" ON "SetCreditRaw"("resolutionStatus");

-- CreateIndex
CREATE INDEX "SetCreditRaw_resolvedPersonId_idx" ON "SetCreditRaw"("resolvedPersonId");

-- CreateIndex
CREATE INDEX "SetCreditRaw_deletedAt_idx" ON "SetCreditRaw"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonMediaLink_personId_idx" ON "PersonMediaLink"("personId");

-- CreateIndex
CREATE INDEX "PersonMediaLink_mediaItemId_idx" ON "PersonMediaLink"("mediaItemId");

-- CreateIndex
CREATE INDEX "PersonMediaLink_deletedAt_idx" ON "PersonMediaLink"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonMediaLink_personId_mediaItemId_usage_key" ON "PersonMediaLink"("personId", "mediaItemId", "usage");

-- CreateIndex
CREATE INDEX "Project_labelId_idx" ON "Project"("labelId");

-- CreateIndex
CREATE INDEX "Session_labelId_idx" ON "Session"("labelId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Set_coverMediaItemId_idx" ON "Set"("coverMediaItemId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLabelMap" ADD CONSTRAINT "ChannelLabelMap_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLabelMap" ADD CONSTRAINT "ChannelLabelMap_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLabelEvidence" ADD CONSTRAINT "SetLabelEvidence_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLabelEvidence" ADD CONSTRAINT "SetLabelEvidence_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Set" ADD CONSTRAINT "Set_coverMediaItemId_fkey" FOREIGN KEY ("coverMediaItemId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetMediaItem" ADD CONSTRAINT "SetMediaItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetMediaItem" ADD CONSTRAINT "SetMediaItem_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetParticipant" ADD CONSTRAINT "SetParticipant_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetParticipant" ADD CONSTRAINT "SetParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCreditRaw" ADD CONSTRAINT "SetCreditRaw_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCreditRaw" ADD CONSTRAINT "SetCreditRaw_resolvedPersonId_fkey" FOREIGN KEY ("resolvedPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMediaLink" ADD CONSTRAINT "PersonMediaLink_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
