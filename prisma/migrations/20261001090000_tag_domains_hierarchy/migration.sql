-- Tagging: domains, typical level, workflow kind, hierarchy (ADR-0033).
--
-- A group gets a hard `domain` (which entities its tags may sit on), a soft
-- `typicalLevel` inside the content chain (ranking only) and a `kind`
-- (WORKFLOW markers never inherit). Tags get one optional parent
-- (implication). `scope[]` and the pending `status` are retired: applicability
-- now lives on the group, and inline-created tags are active at once.
--
-- The copied `tags String[]` columns on the five taggable entities are dropped.
-- They were a cache of tag names that went stale on rename/merge/delete; the
-- join tables are the only truth. Verified before dropping (both prod tenants):
-- every legacy string had a matching join row.
CREATE TYPE "TagDomain" AS ENUM ('PERSON', 'CONTENT', 'PROJECT', 'ANY');
CREATE TYPE "TagLevel" AS ENUM ('SESSION', 'SET', 'MEDIA_ITEM');
CREATE TYPE "TagGroupKind" AS ENUM ('DESCRIPTIVE', 'WORKFLOW');

ALTER TABLE "tag_group"
  ADD COLUMN "domain"       "TagDomain"    NOT NULL DEFAULT 'ANY',
  ADD COLUMN "typicalLevel" "TagLevel",
  ADD COLUMN "kind"         "TagGroupKind" NOT NULL DEFAULT 'DESCRIPTIVE';

DROP INDEX "tag_definition_status_idx";
DROP INDEX "tag_definition_slug_key";
ALTER TABLE "tag_definition"
  DROP COLUMN "scope",
  DROP COLUMN "status",
  ADD COLUMN "parentId"     TEXT,
  ADD COLUMN "typicalLevel" "TagLevel";

CREATE UNIQUE INDEX "tag_definition_groupId_slug_key" ON "tag_definition"("groupId", "slug");
CREATE INDEX "tag_definition_parentId_idx" ON "tag_definition"("parentId");
ALTER TABLE "tag_definition" ADD CONSTRAINT "tag_definition_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "tag_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "MediaItem_tags_idx";
DROP INDEX "Session_tags_idx";
ALTER TABLE "MediaItem" DROP COLUMN "tags";
ALTER TABLE "Person"    DROP COLUMN "tags";
ALTER TABLE "Project"   DROP COLUMN "tags";
ALTER TABLE "Session"   DROP COLUMN "tags";
ALTER TABLE "Set"       DROP COLUMN "tags";
