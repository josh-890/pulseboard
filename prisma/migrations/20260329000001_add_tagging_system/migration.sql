-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('MANUAL', 'IMPORT', 'AUTO');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "tag_group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_definition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameNorm" TEXT,
    "scope" TEXT[] DEFAULT ARRAY['PERSON', 'SESSION', 'MEDIA_ITEM', 'SET', 'PROJECT']::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_tag" (
    "personId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_tag_pkey" PRIMARY KEY ("personId","tagDefinitionId")
);

-- CreateTable
CREATE TABLE "session_tag" (
    "sessionId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_tag_pkey" PRIMARY KEY ("sessionId","tagDefinitionId")
);

-- CreateTable
CREATE TABLE "media_item_tag" (
    "mediaItemId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_item_tag_pkey" PRIMARY KEY ("mediaItemId","tagDefinitionId")
);

-- CreateTable
CREATE TABLE "set_tag" (
    "setId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "set_tag_pkey" PRIMARY KEY ("setId","tagDefinitionId")
);

-- CreateTable
CREATE TABLE "project_tag" (
    "projectId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "source" "TagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tag_pkey" PRIMARY KEY ("projectId","tagDefinitionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_group_name_key" ON "tag_group"("name");
CREATE UNIQUE INDEX "tag_group_slug_key" ON "tag_group"("slug");
CREATE INDEX "tag_group_sortOrder_idx" ON "tag_group"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tag_definition_slug_key" ON "tag_definition"("slug");
CREATE INDEX "tag_definition_groupId_idx" ON "tag_definition"("groupId");
CREATE INDEX "tag_definition_sortOrder_idx" ON "tag_definition"("sortOrder");
CREATE INDEX "tag_definition_nameNorm_idx" ON "tag_definition"("nameNorm");
CREATE UNIQUE INDEX "tag_definition_groupId_name_key" ON "tag_definition"("groupId", "name");

-- CreateIndex (join tables)
CREATE INDEX "person_tag_tagDefinitionId_idx" ON "person_tag"("tagDefinitionId");
CREATE INDEX "session_tag_tagDefinitionId_idx" ON "session_tag"("tagDefinitionId");
CREATE INDEX "media_item_tag_tagDefinitionId_idx" ON "media_item_tag"("tagDefinitionId");
CREATE INDEX "set_tag_tagDefinitionId_idx" ON "set_tag"("tagDefinitionId");
CREATE INDEX "project_tag_tagDefinitionId_idx" ON "project_tag"("tagDefinitionId");

-- CreateIndex (Session tags GIN)
CREATE INDEX "Session_tags_idx" ON "Session" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "tag_definition" ADD CONSTRAINT "tag_definition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tag_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_tag" ADD CONSTRAINT "session_tag_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_tag" ADD CONSTRAINT "session_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_item_tag" ADD CONSTRAINT "media_item_tag_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_item_tag" ADD CONSTRAINT "media_item_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "set_tag" ADD CONSTRAINT "set_tag_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "set_tag" ADD CONSTRAINT "set_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
