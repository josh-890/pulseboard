-- Slice 2 of Phase G (project_scalar_attribute_ui.md): per-person pinned
-- attribute slugs. Holds slugs of PhysicalAttributeDefinitions the user wants
-- visible in the Appearance grid even when no delta has been recorded yet
-- (renders as `Name — + Add` rows). Pinning is per-person; the *system* default
-- pinned set (Height / Weight / Eye color / Hair color / Build) lives in the
-- code, separate from this per-person override list.

ALTER TABLE "Person"
  ADD COLUMN "pinnedAttributeSlugs" TEXT[] NOT NULL DEFAULT '{}';
