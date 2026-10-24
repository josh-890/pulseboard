-- Roles (2026-10-24): a role group's kind replaces the name check "Behind Camera"
-- (renaming a group no longer changes what it means); a role's presence tells a
-- lead from a supporting appearance. A new role Appearance (on camera, SUPPORT).
-- Supporting people count on an image only where linked.

CREATE TYPE "RoleGroupKind" AS ENUM ('ON_CAMERA', 'BEHIND_CAMERA');
ALTER TABLE "ContributionRoleGroup" ADD COLUMN "kind" "RoleGroupKind" NOT NULL DEFAULT 'ON_CAMERA';
UPDATE "ContributionRoleGroup" SET "kind" = 'BEHIND_CAMERA' WHERE name = 'Behind Camera';

CREATE TYPE "RolePresence" AS ENUM ('LEAD', 'SUPPORT');
ALTER TABLE "ContributionRoleDefinition" ADD COLUMN "presence" "RolePresence" NOT NULL DEFAULT 'LEAD';

INSERT INTO "ContributionRoleDefinition" (id, "groupId", name, slug, description, presence, "sortOrder")
SELECT 'crd_appearance', g.id, 'Appearance', 'appearance',
       'Appears on camera without taking part — no intensity, listed under Appears in, shown only on images linked to them',
       'SUPPORT', 1
FROM "ContributionRoleGroup" g
WHERE g.id = 'crg_on_camera'
  AND NOT EXISTS (SELECT 1 FROM "ContributionRoleDefinition" WHERE slug = 'appearance');

CREATE TABLE "media_item_shown_person" (
    "mediaItemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_item_shown_person_pkey" PRIMARY KEY ("mediaItemId","personId")
);
CREATE INDEX "media_item_shown_person_personId_idx" ON "media_item_shown_person"("personId");
ALTER TABLE "media_item_shown_person" ADD CONSTRAINT "media_item_shown_person_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_item_shown_person" ADD CONSTRAINT "media_item_shown_person_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
