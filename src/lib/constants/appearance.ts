export const EYE_COLOR_OPTIONS = [
  "Brown",
  "Blue",
  "Green",
  "Hazel",
  "Gray",
  "Amber",
  "Black",
] as const;

export const NATURAL_HAIR_COLOR_OPTIONS = [
  "Black",
  "Dark Brown",
  "Brown",
  "Light Brown",
  "Auburn",
  "Red",
  "Strawberry Blonde",
  "Blonde",
  "Platinum Blonde",
  "Gray/White",
] as const;

export const CURRENT_HAIR_COLOR_OPTIONS = [
  ...NATURAL_HAIR_COLOR_OPTIONS,
  "Pink",
  "Purple",
  "Blue",
  "Green",
  "Silver",
  "Multicolor",
] as const;

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
