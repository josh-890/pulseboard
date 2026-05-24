// Hair, eye, and skin colors are now catalog-driven via color_catalog.
// Use <ColorValueCombobox category="hair|eye|skin" /> for any color input.

// IDs of the "core" physical attributes that have dedicated UI in the
// appearance views (purpose-built color picker for hair color, numeric input
// for weight, curated select for build/breast-size, freeform for measurements).
// Any view that renders the generic catalog-driven attribute loop should
// SKIP these IDs to avoid duplicating the dedicated UI — otherwise the same
// attribute appears twice in the same dialog. Critically for `cattr-hair-color`,
// the dedicated `<ColorValueCombobox>` is the only path that preserves the
// color_catalog hue/lightness/shade ecosystem.
export const CORE_PHYSICAL_ATTR_IDS = new Set([
  "cattr-hair-color",
  "cattr-weight",
  "cattr-build",
  "cattr-breast-size",
  "cattr-measurements",
]);

export const HAIR_LENGTH_OPTIONS = [
  "Bald/Shaved",
  "Buzz Cut",
  "Short",
  "Medium",
  "Long",
  "Very Long",
] as const;

export const BUILD_OPTIONS = [
  "Slim",
  "Average",
  "Athletic",
  "Muscular",
  "Curvy",
] as const;

export const BREAST_SIZE_OPTIONS = [
  "AA",
  "A",
  "B",
  "C",
  "D",
  "DD/E",
  "F",
  "G+",
] as const;

export const BREAST_STATUS_OPTIONS = [
  "Natural",
  "Enhanced",
  "Reduced",
  "Unknown",
] as const;
