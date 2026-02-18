-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('active', 'inactive', 'wishlist', 'archived');

-- CreateEnum
CREATE TYPE "ContributionRole" AS ENUM ('main', 'supporting', 'background');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('photo', 'video');

-- CreateEnum
CREATE TYPE "RelationshipSource" AS ENUM ('derived', 'manual');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('person_added', 'set_added', 'project_added', 'label_added', 'note');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('person', 'set');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthdate" TIMESTAMP(3),
    "nationality" TEXT,
    "ethnicity" TEXT,
    "location" TEXT,
    "height" INTEGER,
    "hairColor" TEXT,
    "eyeColor" TEXT,
    "bodyType" TEXT,
    "measurements" TEXT,
    "activeSince" INTEGER,
    "specialization" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'active',
    "rating" INTEGER,
    "notes" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonAlias" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRelationship" (
    "id" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "source" "RelationshipSource" NOT NULL DEFAULT 'derived',
    "label" TEXT,
    "sharedSetCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelNetwork" (
    "labelId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,

    CONSTRAINT "LabelNetwork_pkey" PRIMARY KEY ("labelId","networkId")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "platform" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLabel" (
    "projectId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "ProjectLabel_pkey" PRIMARY KEY ("projectId","labelId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Set" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channelId" TEXT,
    "type" "SetType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "releaseDate" TIMESTAMP(3),
    "category" TEXT,
    "genre" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetContribution" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "ContributionRole" NOT NULL DEFAULT 'main',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SetContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalWidth" INTEGER NOT NULL,
    "originalHeight" INTEGER NOT NULL,
    "variants" JSONB NOT NULL,
    "tags" TEXT[],
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "caption" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "type" "ActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Person_firstName_lastName_idx" ON "Person"("firstName", "lastName");

-- CreateIndex
CREATE INDEX "Person_status_idx" ON "Person"("status");

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonAlias_personId_idx" ON "PersonAlias"("personId");

-- CreateIndex
CREATE INDEX "PersonAlias_name_idx" ON "PersonAlias"("name");

-- CreateIndex
CREATE INDEX "PersonAlias_deletedAt_idx" ON "PersonAlias"("deletedAt");

-- CreateIndex
CREATE INDEX "Persona_personId_idx" ON "Persona"("personId");

-- CreateIndex
CREATE INDEX "Persona_deletedAt_idx" ON "Persona"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonRelationship_personAId_idx" ON "PersonRelationship"("personAId");

-- CreateIndex
CREATE INDEX "PersonRelationship_personBId_idx" ON "PersonRelationship"("personBId");

-- CreateIndex
CREATE INDEX "PersonRelationship_deletedAt_idx" ON "PersonRelationship"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelationship_personAId_personBId_key" ON "PersonRelationship"("personAId", "personBId");

-- CreateIndex
CREATE INDEX "Network_name_idx" ON "Network"("name");

-- CreateIndex
CREATE INDEX "Network_deletedAt_idx" ON "Network"("deletedAt");

-- CreateIndex
CREATE INDEX "Label_name_idx" ON "Label"("name");

-- CreateIndex
CREATE INDEX "Label_deletedAt_idx" ON "Label"("deletedAt");

-- CreateIndex
CREATE INDEX "Channel_labelId_idx" ON "Channel"("labelId");

-- CreateIndex
CREATE INDEX "Channel_deletedAt_idx" ON "Channel"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");

-- CreateIndex
CREATE INDEX "Session_date_idx" ON "Session"("date");

-- CreateIndex
CREATE INDEX "Session_deletedAt_idx" ON "Session"("deletedAt");

-- CreateIndex
CREATE INDEX "Set_sessionId_idx" ON "Set"("sessionId");

-- CreateIndex
CREATE INDEX "Set_channelId_idx" ON "Set"("channelId");

-- CreateIndex
CREATE INDEX "Set_type_idx" ON "Set"("type");

-- CreateIndex
CREATE INDEX "Set_releaseDate_idx" ON "Set"("releaseDate");

-- CreateIndex
CREATE INDEX "Set_deletedAt_idx" ON "Set"("deletedAt");

-- CreateIndex
CREATE INDEX "SetContribution_setId_idx" ON "SetContribution"("setId");

-- CreateIndex
CREATE INDEX "SetContribution_personId_idx" ON "SetContribution"("personId");

-- CreateIndex
CREATE INDEX "SetContribution_deletedAt_idx" ON "SetContribution"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SetContribution_setId_personId_key" ON "SetContribution"("setId", "personId");

-- CreateIndex
CREATE INDEX "Photo_entityType_entityId_idx" ON "Photo"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Photo_entityType_entityId_isFavorite_idx" ON "Photo"("entityType", "entityId", "isFavorite");

-- CreateIndex
CREATE INDEX "Photo_deletedAt_idx" ON "Photo"("deletedAt");

-- CreateIndex
CREATE INDEX "Photo_tags_idx" ON "Photo" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "Activity_time_idx" ON "Activity"("time");

-- CreateIndex
CREATE INDEX "Activity_type_idx" ON "Activity"("type");

-- CreateIndex
CREATE INDEX "Activity_deletedAt_idx" ON "Activity"("deletedAt");

-- AddForeignKey
ALTER TABLE "PersonAlias" ADD CONSTRAINT "PersonAlias_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelationship" ADD CONSTRAINT "PersonRelationship_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelNetwork" ADD CONSTRAINT "LabelNetwork_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelNetwork" ADD CONSTRAINT "LabelNetwork_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLabel" ADD CONSTRAINT "ProjectLabel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLabel" ADD CONSTRAINT "ProjectLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Set" ADD CONSTRAINT "Set_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Set" ADD CONSTRAINT "Set_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetContribution" ADD CONSTRAINT "SetContribution_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetContribution" ADD CONSTRAINT "SetContribution_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
