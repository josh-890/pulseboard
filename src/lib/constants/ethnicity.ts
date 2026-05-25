// Phase G Slice 16C: Ethnicity is two attributes in the catalog —
// Ethnicity (Broad) SINGLE_SELECT + Ethnicity (Specific). The Specific
// storage is TEXT (no DB-level constraint), but the form UI offers a
// SELECT filtered by the current Broad pick via ETHNICITY_SPECIFIC_BY_BROAD.
//
// Broad vocab is kept in sync with cattr-ethnicity-broad.allowedValues —
// see migrations 20260525140000_ethnicity_to_catalog_t1 (initial 10) and
// 20260525150000_ethnicity_broad_add_southeast_asian (added Southeast
// Asian for the 11th slot, user decision 2026-05-25).

export const ETHNICITY_BROAD_OPTIONS = [
  "White/Caucasian",
  "Black/African",
  "Hispanic/Latino",
  "East Asian",
  "Southeast Asian",
  "South Asian",
  "Pacific Islander",
  "Middle Eastern",
  "Native/Indigenous",
  "Mixed",
  "Other",
] as const;

export type EthnicityBroad = (typeof ETHNICITY_BROAD_OPTIONS)[number];

// Per-Broad Specific options. Empty array = no sub-region picker shown
// for that Broad (Mixed / Other are categorical leaves; the broad value
// alone is the record).
//
// Curated 2026-05-25 from a mix of the docs/Ethnicity.csv OMB reference,
// existing prod deltas (preserved verbatim), and common-sense additions.
export const ETHNICITY_SPECIFIC_BY_BROAD: Record<EthnicityBroad, readonly string[]> = {
  "White/Caucasian": [
    "European",
    "Eastern European",
    "Northern European",
    "Southern European",
    "Western European",
    "Other White",
  ],
  "Black/African": [
    "African American",
    "Caribbean",
    "Sub-Saharan African",
    "North African",
    "Other Black",
  ],
  "Hispanic/Latino": [
    "Caribbean",
    "Central American",
    "Mexican",
    "South American",
    "Spanish",
    "Other Hispanic",
  ],
  "East Asian": [
    "Chinese",
    "Japanese",
    "Korean",
    "Central Asian",
    "Other East Asian",
  ],
  "Southeast Asian": [
    "Vietnamese",
    "Thai",
    "Filipino",
    "Indonesian",
    "Malay",
    "Other Southeast Asian",
  ],
  "South Asian": [
    "Indian",
    "Pakistani",
    "Bangladeshi",
    "Sri Lankan",
    "Nepali",
    "Other South Asian",
  ],
  "Pacific Islander": [
    "Hawaiian",
    "Maori",
    "Melanesian",
    "Micronesian",
    "Polynesian",
    "Australian Aboriginal",
    "Other Pacific Islander",
  ],
  "Middle Eastern": [
    "Arab",
    "Persian/Iranian",
    "Turkish",
    "Jewish/Israeli",
    "Kurdish",
    "Other Middle Eastern",
  ],
  "Native/Indigenous": [
    "North American",
    "Central American",
    "South American",
    "Other Indigenous",
  ],
  "Mixed": [],
  "Other": [],
};

/** True if the given Broad accepts a Specific sub-region. */
export function broadHasSpecifics(broad: string | null | undefined): boolean {
  if (!broad) return false;
  const list = ETHNICITY_SPECIFIC_BY_BROAD[broad as EthnicityBroad];
  return Array.isArray(list) && list.length > 0;
}
