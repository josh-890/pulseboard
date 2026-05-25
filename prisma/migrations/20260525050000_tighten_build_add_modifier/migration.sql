-- Phase G Slice 16B · Attr 2: tighten Build to SINGLE_SELECT + introduce
-- Build Modifier MULTI_SELECT to capture within-bucket variation.
--
-- User decision 2026-05-25 (after grilling): the single-axis Build attr
-- fails to differentiate slim subjects (almost all of the dataset is
-- "Slim"). Adopt the orthogonal-tags approach (Option A): keep Build as
-- the 5-value silhouette + add a MULTI_SELECT modifier for fine-grained
-- traits like bony / lanky / long-legged / flat-stomach / etc.
--
-- Build vocab:
--   Slim / Normal / Athletic / Curvy / Plus / Other
--
-- Build Modifier vocab (14 tags across 5 axes):
--   Bony, Filled out, Long-legged, Long-torso, Petite frame, Tall frame,
--   Lanky, Flat stomach, Soft stomach, Small bust, Larger bust, Toned,
--   Defined abs, Muscular
--
-- Pre-tightening data remap (29 existing Build deltas across both tenants):
--   slim    → Slim       (case normalize)
--   Slim    → Slim       (already correct)
--   athletic→ Athletic   (case normalize)
--   Athletic→ Athletic   (already correct)
--   average → Normal     (vocab change)
-- All deltas land cleanly in the new vocab; zero data loss.
--
-- Build Modifier is inserted into Core Physical group right after Build
-- (sortOrder=4); existing entries at sortOrder>=4 shift up by 1.

BEGIN;

-- ── Build: normalize existing values ──
UPDATE "ScalarDelta" SET value = 'Slim'
 WHERE "attributeDefinitionId" = 'cattr-build' AND value = 'slim';
UPDATE "ScalarDelta" SET value = 'Athletic'
 WHERE "attributeDefinitionId" = 'cattr-build' AND value = 'athletic';
UPDATE "ScalarDelta" SET value = 'Normal'
 WHERE "attributeDefinitionId" = 'cattr-build' AND value = 'average';

-- ── Build: tighten to SINGLE_SELECT ──
UPDATE "PhysicalAttributeDefinition"
   SET "valueType"     = 'SINGLE_SELECT',
       "allowedValues" = ARRAY['Slim','Normal','Athletic','Curvy','Plus','Other']
 WHERE id = 'cattr-build';

-- ── Build Modifier: insert new MULTI_SELECT attr at sortOrder=4 ──
-- Bump existing Core Physical entries at sortOrder>=4 first.
UPDATE "PhysicalAttributeDefinition"
   SET "sortOrder" = "sortOrder" + 1
 WHERE "groupId" = 'grp-core-physical' AND "sortOrder" >= 4;

INSERT INTO "PhysicalAttributeDefinition" (
  id, "groupId", name, slug, "valueType", "allowedValues",
  "sortOrder", mutability, "statusBearing", "createdAt"
) VALUES (
  'cattr-build-modifier',
  'grp-core-physical',
  'Build Modifier',
  'build-modifier',
  'MULTI_SELECT',
  ARRAY[
    'Bony','Filled out','Long-legged','Long-torso','Petite frame','Tall frame',
    'Lanky','Flat stomach','Soft stomach','Small bust','Larger bust',
    'Toned','Defined abs','Muscular'
  ],
  4,
  'RARELY_CHANGES',
  FALSE,
  now()
);

-- ── Recompute PersonCurrentState for everyone ──
-- The case normalization on Build deltas affects the fold winner for
-- anyone whose latest Build delta was a lowercase 'slim' or 'athletic'.
SELECT app_recompute_person_current_state();

COMMIT;
