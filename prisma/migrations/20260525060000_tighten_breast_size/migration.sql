-- Phase G Slice 16B · Attr 3: tighten Breast Size to SINGLE_SELECT.
--
-- User decision 2026-05-25: conservative cup vocabulary AA / A / B / C /
-- D / DD / E / F. Covers ~95% of population and contains every existing
-- xpulse delta value (C×10, B×7, D×2, A×2, DD×1 = 22 deltas, 0 on pulse).
-- Extending to G/H/I etc. can be done later via the catalog manager if
-- needed.
--
-- Bra Size (overlap candidate per cleanup memo item 4) stays for now —
-- deferred to Phase 16D group hygiene.
--
-- No ScalarDelta value remap required: every existing value is already
-- in the new vocabulary. No PersonCurrentState recompute needed.

UPDATE "PhysicalAttributeDefinition"
   SET "valueType"     = 'SINGLE_SELECT',
       "allowedValues" = ARRAY['AA','A','B','C','D','DD','E','F']
 WHERE id = 'cattr-breast-size';
