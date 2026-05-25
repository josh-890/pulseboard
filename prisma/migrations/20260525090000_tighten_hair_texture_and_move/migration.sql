-- Phase G Slice 16B · Attr 6: tighten Hair Texture to SINGLE_SELECT and
-- move from Facial Features → Hair Features group (group hygiene per
-- cleanup memo item 4).
--
-- Vocab: Straight / Wavy / Curly / Coily (cosmetic-industry Type 1-4).
-- 0 deltas to remap on either tenant.
--
-- Group IDs differ across tenants (random cuids), so the move uses a
-- subquery to look up Hair Features by name. New sortOrder = max(existing
-- Hair Features sortOrders) + 1 → lands at the bottom of Hair Features.
--
-- Note: 'hair_pattern' (also in Hair Features) is dye-pattern, NOT curl
-- pattern, despite the misleading name. No semantic overlap with
-- hair-texture; a rename of hair_pattern is deferred to Phase 16D.

BEGIN;

-- 1. Tighten valueType + allowedValues
UPDATE "PhysicalAttributeDefinition"
   SET "valueType"     = 'SINGLE_SELECT',
       "allowedValues" = ARRAY['Straight','Wavy','Curly','Coily']
 WHERE slug = 'hair-texture';

-- 2. Move to Hair Features group with the next available sortOrder.
--    Use a CTE so the new sortOrder is computed BEFORE the row's groupId
--    is updated (otherwise the row itself would be in the source group
--    for the MAX subquery).
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
 WHERE pd.slug = 'hair-texture';

COMMIT;
