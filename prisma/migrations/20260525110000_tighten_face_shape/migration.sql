-- Phase G Slice 16B · Attr 8: tighten Face Shape to SINGLE_SELECT.
-- Standard 5-value vocab. 0 deltas to remap. Group already correct
-- (Facial Features).

UPDATE "PhysicalAttributeDefinition"
   SET "valueType"     = 'SINGLE_SELECT',
       "allowedValues" = ARRAY['Oval','Round','Square','Heart','Long']
 WHERE slug = 'face-shape';
