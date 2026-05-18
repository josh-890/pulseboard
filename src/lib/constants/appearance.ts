// Hair, eye, and skin colors are now catalog-driven via color_catalog.
// Use <ColorValueCombobox category="hair|eye|skin" /> for any color input.

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
