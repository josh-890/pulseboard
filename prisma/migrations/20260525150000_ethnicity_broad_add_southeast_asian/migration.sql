-- Phase G Slice 16C · T4 follow-up: extend cattr-ethnicity-broad's
-- SINGLE_SELECT vocab from 10 → 11 values by adding 'Southeast Asian'.
--
-- User decision 2026-05-25: Southeast Asian (Vietnamese / Thai / Filipino
-- / etc.) doesn't fit cleanly under East Asian or South Asian, so it gets
-- its own broad bucket. Central Asian stays as a Specific under
-- East Asian (per the curated Specific-by-Broad lookup in
-- src/lib/constants/ethnicity.ts).
--
-- No data remap — existing deltas don't reference 'Southeast Asian' yet.
-- New value goes between East Asian and South Asian to keep regional
-- adjacency in the dropdown.

UPDATE "PhysicalAttributeDefinition"
   SET "allowedValues" = ARRAY[
     'White/Caucasian','Black/African','Hispanic/Latino',
     'East Asian','Southeast Asian','South Asian','Pacific Islander',
     'Middle Eastern','Native/Indigenous','Mixed','Other'
   ]
 WHERE id = 'cattr-ethnicity-broad';
