export type ColorCategory = "hair" | "eye" | "skin";

export type ColorFamilyEntry = {
  family: string;
  hueGroup?: string;
  values: string[];
};

export const HAIR_COLOR_FAMILIES: ColorFamilyEntry[] = [
  { family: "Black",    hueGroup: "Cool",    values: ["black", "jet black", "raven", "ebony", "midnight"] },
  { family: "Brown",    hueGroup: "Dark",    values: ["dark brown", "espresso", "chocolate", "chestnut brown", "mahogany"] },
  { family: "Brown",    hueGroup: "Medium",  values: ["brown", "chestnut", "auburn", "hazelnut"] },
  { family: "Brown",    hueGroup: "Light",   values: ["light brown", "caramel", "honey", "golden brown"] },
  { family: "Blonde",   hueGroup: "Warm",    values: ["dark blonde", "dirty blonde", "honey blonde", "strawberry blonde"] },
  { family: "Blonde",   hueGroup: "Medium",  values: ["blonde", "golden", "wheat"] },
  { family: "Blonde",   hueGroup: "Light",   values: ["light blonde", "platinum", "platinum blonde", "ash blonde", "icy blonde"] },
  { family: "Red",      hueGroup: "Warm",    values: ["red", "ginger", "copper", "auburn red", "cherry"] },
  { family: "Gray",                          values: ["gray", "grey", "silver", "salt and pepper"] },
  { family: "White",                         values: ["white", "snow white"] },
  { family: "Colored",                       values: ["pink", "blue", "green", "purple", "rainbow", "dyed"] },
];

export const EYE_COLOR_FAMILIES: ColorFamilyEntry[] = [
  { family: "Brown", values: ["brown", "dark brown", "chestnut", "amber"] },
  { family: "Blue",  values: ["blue", "light blue", "ice blue", "sky blue", "deep blue", "navy"] },
  { family: "Green", values: ["green", "emerald", "olive green", "sea green"] },
  { family: "Hazel", values: ["hazel", "hazel green", "hazel brown"] },
  { family: "Gray",  values: ["gray", "grey", "silver"] },
  { family: "Other", values: ["heterochromia", "violet"] },
];

export const SKIN_TONE_FAMILIES: ColorFamilyEntry[] = [
  { family: "Fair",   hueGroup: "Cool", values: ["fair", "porcelain", "ivory"] },
  { family: "Light",  hueGroup: "Warm", values: ["light", "beige", "peach"] },
  { family: "Medium", hueGroup: "Warm", values: ["medium", "olive", "tan"] },
  { family: "Tan",    hueGroup: "Warm", values: ["bronze", "golden tan", "caramel"] },
  { family: "Deep",   hueGroup: "Warm", values: ["deep", "brown", "dark brown"] },
  { family: "Ebony",  hueGroup: "Cool", values: ["ebony", "black", "very dark"] },
];

function pickCategoryTable(category: ColorCategory): ColorFamilyEntry[] {
  switch (category) {
    case "hair": return HAIR_COLOR_FAMILIES;
    case "eye":  return EYE_COLOR_FAMILIES;
    case "skin": return SKIN_TONE_FAMILIES;
  }
}

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

export function getFamily(category: ColorCategory, value: string | null | undefined): string | null {
  if (!value) return null;
  const norm = normalize(value);
  for (const entry of pickCategoryTable(category)) {
    if (entry.values.includes(norm)) return entry.family;
  }
  return null;
}

export function expandFamilyToValues(category: ColorCategory, family: string): string[] {
  const out: string[] = [];
  for (const entry of pickCategoryTable(category)) {
    if (entry.family === family) out.push(...entry.values);
  }
  return out;
}

export function getAllFamilies(category: ColorCategory): string[] {
  const seen = new Set<string>();
  for (const entry of pickCategoryTable(category)) seen.add(entry.family);
  return Array.from(seen);
}

export type ColorFamilyMapRow = {
  category: ColorCategory;
  value_norm: string;
  family: string;
  hue_group: string | null;
};

export function buildColorFamilyMapRows(): ColorFamilyMapRow[] {
  const rows: ColorFamilyMapRow[] = [];
  for (const category of ["hair", "eye", "skin"] as ColorCategory[]) {
    for (const entry of pickCategoryTable(category)) {
      for (const value of entry.values) {
        rows.push({
          category,
          value_norm: normalize(value),
          family: entry.family,
          hue_group: entry.hueGroup ?? null,
        });
      }
    }
  }
  return rows;
}
