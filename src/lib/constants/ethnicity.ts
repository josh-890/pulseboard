// Phase G Slice 16C T3: Ethnicity is now two attributes in the catalog —
// Ethnicity (Broad) SINGLE_SELECT + Ethnicity (Specific) TEXT.
// Forms use this Broad vocab; Specific is free-form text.
//
// Keep in sync with allowedValues on cattr-ethnicity-broad (migration
// 20260525140000_ethnicity_to_catalog_t1).

export const ETHNICITY_BROAD_OPTIONS = [
  "White/Caucasian",
  "Black/African",
  "Hispanic/Latino",
  "East Asian",
  "South Asian",
  "Pacific Islander",
  "Middle Eastern",
  "Native/Indigenous",
  "Mixed",
  "Other",
] as const;

export type EthnicityBroad = (typeof ETHNICITY_BROAD_OPTIONS)[number];
