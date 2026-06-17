// Hair, eye, and skin colors are catalog-driven via color_catalog.
// Per ADR-0010 (Slice 16E), the catalog definitions for those three slugs
// carry `colorCategory` and the canonical edit path is <TypedAttributeInput
// definition={def}> — TypedAttributeInput routes to ColorValueCombobox on
// the colorCategory branch. Don't import ColorValueCombobox directly in new
// code; let TypedAttributeInput handle dispatch.

// IDs of the "core" physical attributes that have dedicated UI in the
// appearance views (purpose-built color picker for hair color, numeric input
// for weight, curated select for build/breast-size, freeform for measurements).
// Any view that renders the generic catalog-driven attribute loop should
// SKIP these IDs to avoid duplicating the dedicated UI — otherwise the same
// attribute appears twice in the same dialog.
export const CORE_PHYSICAL_ATTR_IDS = new Set([
  "cattr-hair-color",
  "cattr-weight",
  "cattr-build",
  "cattr-breast-size",
  "cattr-measurements",
]);

// Mirrors PhysicalAttributeDefinition.allowedValues for the corresponding
// catalog slug. Kept in sync manually because these dedicated pickers
// (SelectWithOther in the Record/Edit appearance sheets + person form) need
// the canonical anchored strings so writes hit the same value space as the
// catalog. Drift here was the root cause of stray "DD/E", "G+", "Average",
// "Muscular" rows that don't appear in any allowedValues array.

export const HAIR_LENGTH_OPTIONS = [
  "Buzz / Shaved (under 2 cm)",
  "Pixie / Ear-length (ear / jawline)",
  "Short / Bob (chin to neck)",
  "Shoulder-length (collarbone / shoulders)",
  "Medium / Armpit-length (armpit level)",
  "Mid-Long / Bra-strap (bra-strap level)",
  "Long / Mid-back (below ribs / mid-back)",
  "Very Long (waist or longer)",
] as const;

export const BUILD_OPTIONS = [
  "Slim (thin frame, low body mass)",
  "Normal (average proportions)",
  "Athletic (toned, defined muscles)",
  "Curvy (pronounced hips/bust, narrow waist)",
  "Plus (fuller figure)",
  "Other",
] as const;

export const BREAST_SIZE_OPTIONS = [
  "AA (very small / nearly flat)",
  "A (small)",
  "B (small to medium)",
  "C (medium)",
  "D (full)",
  "DD (very full)",
  "E (extra full)",
  "F (very large)",
] as const;
