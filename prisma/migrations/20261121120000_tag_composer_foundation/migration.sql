-- Tag Composer foundation (ADR-0042): several parents per tag, confusable pairs,
-- the Composer's paths and sections, and the state × garment matrix. Additive.

CREATE TYPE "ComposerSectionKind" AS ENUM ('TILES', 'REFINEMENT', 'MATRIX');

CREATE TABLE "tag_extra_parent" (
    "tagId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tag_extra_parent_pkey" PRIMARY KEY ("tagId", "parentId")
);
CREATE INDEX "tag_extra_parent_parentId_idx" ON "tag_extra_parent"("parentId");
ALTER TABLE "tag_extra_parent" ADD CONSTRAINT "tag_extra_parent_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_extra_parent" ADD CONSTRAINT "tag_extra_parent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tag_confusable" (
    "tagAId" TEXT NOT NULL,
    "tagBId" TEXT NOT NULL,
    CONSTRAINT "tag_confusable_pkey" PRIMARY KEY ("tagAId", "tagBId")
);
CREATE INDEX "tag_confusable_tagBId_idx" ON "tag_confusable"("tagBId");
ALTER TABLE "tag_confusable" ADD CONSTRAINT "tag_confusable_tagAId_fkey" FOREIGN KEY ("tagAId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_confusable" ADD CONSTRAINT "tag_confusable_tagBId_fkey" FOREIGN KEY ("tagBId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "composer_path" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tileAspect" TEXT NOT NULL DEFAULT '1:1',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "composer_path_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "composer_path_name_key" ON "composer_path"("name");

CREATE TABLE "composer_section" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" "ComposerSectionKind" NOT NULL DEFAULT 'TILES',
    "passable" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "composer_section_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "composer_section_pathId_name_key" ON "composer_section"("pathId", "name");
ALTER TABLE "composer_section" ADD CONSTRAINT "composer_section_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "composer_path"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "composer_section_group" (
    "sectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "composer_section_group_pkey" PRIMARY KEY ("sectionId", "groupId")
);
CREATE INDEX "composer_section_group_groupId_idx" ON "composer_section_group"("groupId");
ALTER TABLE "composer_section_group" ADD CONSTRAINT "composer_section_group_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "composer_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composer_section_group" ADD CONSTRAINT "composer_section_group_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tag_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tag_state_rule" (
    "id" TEXT NOT NULL,
    "stateGroupId" TEXT NOT NULL,
    "genericTagId" TEXT NOT NULL,
    "namePattern" TEXT NOT NULL,
    CONSTRAINT "tag_state_rule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tag_state_rule_stateGroupId_key" ON "tag_state_rule"("stateGroupId");
ALTER TABLE "tag_state_rule" ADD CONSTRAINT "tag_state_rule_stateGroupId_fkey" FOREIGN KEY ("stateGroupId") REFERENCES "tag_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_state_rule" ADD CONSTRAINT "tag_state_rule_genericTagId_fkey" FOREIGN KEY ("genericTagId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tag_state_rule_target" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "groupId" TEXT,
    "tagId" TEXT,
    "nameOverride" TEXT,
    CONSTRAINT "tag_state_rule_target_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tag_state_rule_target_ruleId_idx" ON "tag_state_rule_target"("ruleId");
ALTER TABLE "tag_state_rule_target" ADD CONSTRAINT "tag_state_rule_target_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "tag_state_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_state_rule_target" ADD CONSTRAINT "tag_state_rule_target_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tag_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tag_state_rule_target" ADD CONSTRAINT "tag_state_rule_target_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
