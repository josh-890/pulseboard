-- ADR-0016 slice 6e-2: retire the profile-slot weld.
--
-- The avatar and every per-framing display now read the Profile-category
-- representative (a DETAIL PersonMediaLink with categoryId = cat_profile_slot{N}
-- and isRepresentative). The legacy HEADSHOT links and the slot / isAvatar /
-- MotifTemplate.slot columns are fully superseded. The representatives were already
-- backfilled on every tenant by the slice-6c migrate-profile-links pass.
--
-- ORDERING (irreversible): deploy the new application code — which no longer reads
-- slot / isAvatar / MotifTemplate.slot — to the container BEFORE running this
-- migration. An old container still selecting those columns would error once they
-- are dropped.

-- 1. Drop the now-redundant legacy HEADSHOT links (the displayed framing lives as a
--    DETAIL + category representative).
DELETE FROM "PersonMediaLink" WHERE "usage" = 'HEADSHOT';

-- 2. Retire the slot / isAvatar columns on PersonMediaLink.
ALTER TABLE "PersonMediaLink" DROP COLUMN "slot";
ALTER TABLE "PersonMediaLink" DROP COLUMN "isAvatar";

-- 3. Retire the profile-slot binding on MotifTemplate (templates are category-bound).
--    Dropping the column also drops its UNIQUE index.
ALTER TABLE "MotifTemplate" DROP COLUMN "slot";
