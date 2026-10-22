-- Retire Skills (ADR-0036, slice 5). Person skills became "Person traits" tags
-- beforehand where wanted (pulse); everything else is dropped as grilled
-- 2026-10-22. Person.pgrade stays.

DROP TABLE "SkillEventMedia";
DROP TABLE "PersonSkillEvent";
DROP TABLE "ContributionSkill";
DROP TABLE "PersonSkill";
DROP TABLE "SkillDefinition";
DROP TABLE "SkillGroup";

DROP TYPE "SkillEventType";
DROP TYPE "SkillLevel";

-- The level labels and factors of the old Skills catalog page
DELETE FROM "Setting" WHERE key LIKE 'skill-level-%';
