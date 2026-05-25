-- Phase G Slice 16B · Attr 7: tighten Hair Length to SINGLE_SELECT and
-- move from Facial Features → Hair Features group.
--
-- User-curated 8-value vocab with positional anchors inline (modeling-
-- industry style). Anchors clarify each category at a glance:
--
--   1  Buzz / Shaved (under 2 cm)
--   2  Pixie / Ear-length (ear / jawline)
--   3  Short / Bob (chin to neck)
--   4  Shoulder-length (collarbone / shoulders)
--   5  Medium / Armpit-length (armpit level)
--   6  Mid-Long / Bra-strap (bra-strap level)
--   7  Long / Mid-back (below ribs / mid-back)
--   8  Very Long (waist or longer)
--
-- Existing data: 1 xpulse delta with value 'Long' → remap to #7
-- 'Long / Mid-back (below ribs / mid-back)' (label literally contains
-- the old value).

BEGIN;

-- 1. Remap existing 'Long' deltas to the new compound label.
UPDATE "ScalarDelta"
   SET value = 'Long / Mid-back (below ribs / mid-back)'
 WHERE "attributeDefinitionId" = (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'hair-length')
   AND value = 'Long';

-- 2. Tighten valueType + allowedValues.
UPDATE "PhysicalAttributeDefinition"
   SET "valueType"     = 'SINGLE_SELECT',
       "allowedValues" = ARRAY[
         'Buzz / Shaved (under 2 cm)',
         'Pixie / Ear-length (ear / jawline)',
         'Short / Bob (chin to neck)',
         'Shoulder-length (collarbone / shoulders)',
         'Medium / Armpit-length (armpit level)',
         'Mid-Long / Bra-strap (bra-strap level)',
         'Long / Mid-back (below ribs / mid-back)',
         'Very Long (waist or longer)'
       ]
 WHERE slug = 'hair-length';

-- 3. Move to Hair Features group (group hygiene per cleanup memo).
WITH hair_features AS (
  SELECT g.id AS group_id,
         COALESCE(MAX(d."sortOrder"), -1) + 1 AS next_sort_order
    FROM "PhysicalAttributeGroup" g
    LEFT JOIN "PhysicalAttributeDefinition" d ON d."groupId" = g.id
   WHERE g.name = 'Hair Features'
   GROUP BY g.id
)
UPDATE "PhysicalAttributeDefinition" pd
   SET "groupId"   = hf.group_id,
       "sortOrder" = hf.next_sort_order
  FROM hair_features hf
 WHERE pd.slug = 'hair-length';

COMMIT;
