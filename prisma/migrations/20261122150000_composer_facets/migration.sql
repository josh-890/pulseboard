-- Composer refinement (ADR-0043): facet choice and framing per tag group, context
-- relevance, person attribution of photo tags, drawings and region links. Additive.
CREATE TYPE "FacetChoice" AS ENUM ('ONE', 'MANY');
CREATE TYPE "RelevanceLevel" AS ENUM ('TYPICAL', 'POSSIBLE', 'IMPOSSIBLE');
CREATE TYPE "RelevanceTarget" AS ENUM ('PATH', 'GROUP', 'TAG');

ALTER TABLE "tag_group" ADD COLUMN "composerChoice" "FacetChoice" NOT NULL DEFAULT 'MANY';
ALTER TABLE "tag_group" ADD COLUMN "framingFill" DOUBLE PRECISION;
ALTER TABLE "tag_group" ADD COLUMN "framingTop" DOUBLE PRECISION;
ALTER TABLE "tag_group" ADD COLUMN "tileAspect" TEXT;

ALTER TABLE "tag_definition" ADD COLUMN "drawingKey" TEXT;
ALTER TABLE "tag_definition" ADD COLUMN "regionCatalogId" TEXT;

ALTER TABLE "composer_path" ADD COLUMN "personal" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "tag_relevance" (
    "id" TEXT NOT NULL,
    "contextTagId" TEXT NOT NULL,
    "targetKind" "RelevanceTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "level" "RelevanceLevel" NOT NULL,
    CONSTRAINT "tag_relevance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tag_relevance_contextTagId_targetKind_targetId_key" ON "tag_relevance"("contextTagId", "targetKind", "targetId");
CREATE INDEX "tag_relevance_targetKind_targetId_idx" ON "tag_relevance"("targetKind", "targetId");
ALTER TABLE "tag_relevance" ADD CONSTRAINT "tag_relevance_contextTagId_fkey" FOREIGN KEY ("contextTagId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "media_item_tag_person" (
    "mediaItemId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "media_item_tag_person_pkey" PRIMARY KEY ("mediaItemId", "tagDefinitionId", "personId")
);
CREATE INDEX "media_item_tag_person_tagDefinitionId_idx" ON "media_item_tag_person"("tagDefinitionId");
CREATE INDEX "media_item_tag_person_personId_idx" ON "media_item_tag_person"("personId");
ALTER TABLE "media_item_tag_person" ADD CONSTRAINT "media_item_tag_person_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_item_tag_person" ADD CONSTRAINT "media_item_tag_person_tagDefinitionId_fkey" FOREIGN KEY ("tagDefinitionId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_item_tag_person" ADD CONSTRAINT "media_item_tag_person_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
