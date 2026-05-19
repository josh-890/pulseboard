export type ColorCategory = "hair" | "eye" | "skin";

export type ColorCatalogEntry = {
  value: string;        // canonical lowercase string used in person records
  display: string;      // title-cased for UI
  hue: string;          // primary axis
  shade?: string;       // secondary axis (undertone for skin)
  shadeRank?: number;   // ordinal for range queries
  sortOrder?: number;
};

// ─── HAIR (7 hues × 5 shades) ───────────────────────────────────────────────
// Hue:   Black, Brown, Blonde, Red, Gray, White, Other
// Shade: Very Dark (1), Dark (2), Medium (3), Light (4), Very Light (5)
export const HAIR_COLORS: ColorCatalogEntry[] = [
  // Black — always Very Dark
  { value: "black",       display: "Black",       hue: "Black",  shade: "Very Dark",  shadeRank: 1 },
  { value: "jet black",   display: "Jet Black",   hue: "Black",  shade: "Very Dark",  shadeRank: 1 },
  { value: "raven",       display: "Raven",       hue: "Black",  shade: "Very Dark",  shadeRank: 1 },
  { value: "ebony",       display: "Ebony",       hue: "Black",  shade: "Very Dark",  shadeRank: 1 },
  { value: "midnight",    display: "Midnight",    hue: "Black",  shade: "Very Dark",  shadeRank: 1 },
  { value: "onyx",        display: "Onyx",        hue: "Black",  shade: "Very Dark",  shadeRank: 1 },

  // Brown
  { value: "very dark brown", display: "Very Dark Brown", hue: "Brown",  shade: "Very Dark",  shadeRank: 1 },
  { value: "dark brown",    display: "Dark Brown",    hue: "Brown",  shade: "Dark",       shadeRank: 2 },
  { value: "espresso",      display: "Espresso",      hue: "Brown",  shade: "Dark",       shadeRank: 2 },
  { value: "chocolate",     display: "Chocolate",     hue: "Brown",  shade: "Dark",       shadeRank: 2 },
  { value: "mahogany",      display: "Mahogany",      hue: "Brown",  shade: "Dark",       shadeRank: 2 },
  { value: "chestnut brown",display: "Chestnut Brown",hue: "Brown",  shade: "Dark",       shadeRank: 2 },
  { value: "brown",         display: "Brown",         hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "brunette",      display: "Brunette",      hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "chestnut",      display: "Chestnut",      hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "hazelnut",      display: "Hazelnut",      hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "walnut",        display: "Walnut",        hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  // Light Brown sits at absolute Level ~5 — same lightness tier as Brown.
  { value: "light brown",   display: "Light Brown",   hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "caramel",       display: "Caramel",       hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "honey brown",   display: "Honey Brown",   hue: "Brown",  shade: "Medium",     shadeRank: 3 },
  { value: "golden brown",  display: "Golden Brown",  hue: "Brown",  shade: "Medium",     shadeRank: 3 },

  // Blonde — absolute Lightness via 2-level bands on the professional scale.
  // Dark Blonde (Level 6) joins Light Brown (Level 5) at Medium because they're
  // adjacent on the universal lightness axis and visually near-identical.
  // Blonde (Level 7) and Light Blonde (Level 8) sit at Light. Platinum (Level
  // 10) range stays at Very Light.
  { value: "dark blonde",      display: "Dark Blonde",      hue: "Blonde", shade: "Medium",    shadeRank: 3 },
  { value: "dirty blonde",     display: "Dirty Blonde",     hue: "Blonde", shade: "Medium",    shadeRank: 3 },
  { value: "dishwater blonde", display: "Dishwater Blonde", hue: "Blonde", shade: "Medium",    shadeRank: 3 },
  { value: "blonde",           display: "Blonde",           hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "golden",           display: "Golden",           hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "honey blonde",     display: "Honey Blonde",     hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "strawberry blonde",display: "Strawberry Blonde",hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "wheat",            display: "Wheat",            hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "sandy blonde",     display: "Sandy Blonde",     hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "light blonde",     display: "Light Blonde",     hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "ash blonde",       display: "Ash Blonde",       hue: "Blonde", shade: "Light",     shadeRank: 4 },
  { value: "platinum",         display: "Platinum",         hue: "Blonde", shade: "Very Light",shadeRank: 5 },
  { value: "platinum blonde",  display: "Platinum Blonde",  hue: "Blonde", shade: "Very Light",shadeRank: 5 },
  { value: "ice blonde",       display: "Ice Blonde",       hue: "Blonde", shade: "Very Light",shadeRank: 5 },
  { value: "icy blonde",       display: "Icy Blonde",       hue: "Blonde", shade: "Very Light",shadeRank: 5 },
  { value: "white blonde",     display: "White Blonde",     hue: "Blonde", shade: "Very Light",shadeRank: 5 },
  { value: "bleached",         display: "Bleached",         hue: "Blonde", shade: "Very Light",shadeRank: 5 },

  // Red
  { value: "dark red",      display: "Dark Red",      hue: "Red",   shade: "Dark",   shadeRank: 2 },
  { value: "deep red",      display: "Deep Red",      hue: "Red",   shade: "Dark",   shadeRank: 2 },
  { value: "burgundy",      display: "Burgundy",      hue: "Red",   shade: "Dark",   shadeRank: 2 },
  { value: "mahogany red",  display: "Mahogany Red",  hue: "Red",   shade: "Dark",   shadeRank: 2 },
  { value: "red",           display: "Red",           hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "ginger",        display: "Ginger",        hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "auburn",        display: "Auburn",        hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "copper",        display: "Copper",        hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "cherry",        display: "Cherry",        hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "henna",         display: "Henna",         hue: "Red",   shade: "Medium", shadeRank: 3 },
  { value: "strawberry",    display: "Strawberry",    hue: "Red",   shade: "Light",  shadeRank: 4 },
  { value: "light red",     display: "Light Red",     hue: "Red",   shade: "Light",  shadeRank: 4 },

  // Gray — absolute lightness; charcoal/salt-and-pepper sit mid, silver is light
  { value: "salt and pepper", display: "Salt & Pepper", hue: "Gray",  shade: "Medium", shadeRank: 3 },
  { value: "charcoal",        display: "Charcoal",      hue: "Gray",  shade: "Medium", shadeRank: 3 },
  { value: "gray",            display: "Gray",          hue: "Gray",  shade: "Medium", shadeRank: 3 },
  { value: "grey",            display: "Grey",          hue: "Gray",  shade: "Medium", shadeRank: 3 },
  { value: "silver",          display: "Silver",        hue: "Gray",  shade: "Light",  shadeRank: 4 },
  { value: "light gray",      display: "Light Gray",    hue: "Gray",  shade: "Light",  shadeRank: 4 },

  // White — always Very Light
  { value: "white",       display: "White",       hue: "White", shade: "Very Light", shadeRank: 5 },
  { value: "snow white",  display: "Snow White",  hue: "White", shade: "Very Light", shadeRank: 5 },
  { value: "snow",        display: "Snow",        hue: "White", shade: "Very Light", shadeRank: 5 },

  // Other (dyed, unnatural, mixed)
  { value: "pink",    display: "Pink",    hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "blue",    display: "Blue",    hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "green",   display: "Green",   hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "purple",  display: "Purple",  hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "rainbow", display: "Rainbow", hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "dyed",    display: "Dyed",    hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "ombre",   display: "Ombre",   hue: "Other", shade: "Medium", shadeRank: 3 },
  { value: "balayage",display: "Balayage",hue: "Other", shade: "Medium", shadeRank: 3 },
];

// ─── EYE (7 hues × 3 shades) ────────────────────────────────────────────────
// Hue:   Brown, Blue, Green, Hazel, Gray, Amber, Violet, Other
// Shade: Dark (1), Medium (2), Light (3)
export const EYE_COLORS: ColorCatalogEntry[] = [
  // Brown
  { value: "dark brown",   display: "Dark Brown",   hue: "Brown", shade: "Dark",   shadeRank: 1 },
  { value: "chocolate",    display: "Chocolate",    hue: "Brown", shade: "Dark",   shadeRank: 1 },
  { value: "almost black", display: "Almost Black", hue: "Brown", shade: "Dark",   shadeRank: 1 },
  { value: "brown",        display: "Brown",        hue: "Brown", shade: "Medium", shadeRank: 2 },
  { value: "chestnut",     display: "Chestnut",     hue: "Brown", shade: "Medium", shadeRank: 2 },
  { value: "mocha",        display: "Mocha",        hue: "Brown", shade: "Medium", shadeRank: 2 },
  // Light Brown eyes still sit at mid-lightness on the absolute scale.
  { value: "light brown",  display: "Light Brown",  hue: "Brown", shade: "Medium", shadeRank: 2 },

  // Blue
  { value: "deep blue",     display: "Deep Blue",     hue: "Blue", shade: "Dark",   shadeRank: 1 },
  { value: "navy",          display: "Navy",          hue: "Blue", shade: "Dark",   shadeRank: 1 },
  { value: "midnight blue", display: "Midnight Blue", hue: "Blue", shade: "Dark",   shadeRank: 1 },
  { value: "blue",          display: "Blue",          hue: "Blue", shade: "Medium", shadeRank: 2 },
  { value: "ocean blue",    display: "Ocean Blue",    hue: "Blue", shade: "Medium", shadeRank: 2 },
  { value: "steel blue",    display: "Steel Blue",    hue: "Blue", shade: "Medium", shadeRank: 2 },
  { value: "denim",         display: "Denim",         hue: "Blue", shade: "Medium", shadeRank: 2 },
  { value: "sky blue",      display: "Sky Blue",      hue: "Blue", shade: "Light",  shadeRank: 3 },
  { value: "ice blue",      display: "Ice Blue",      hue: "Blue", shade: "Light",  shadeRank: 3 },
  { value: "light blue",    display: "Light Blue",    hue: "Blue", shade: "Light",  shadeRank: 3 },
  { value: "baby blue",     display: "Baby Blue",     hue: "Blue", shade: "Light",  shadeRank: 3 },

  // Green
  { value: "deep green", display: "Deep Green", hue: "Green", shade: "Dark",   shadeRank: 1 },
  { value: "dark green", display: "Dark Green", hue: "Green", shade: "Dark",   shadeRank: 1 },
  { value: "green",      display: "Green",      hue: "Green", shade: "Medium", shadeRank: 2 },
  { value: "emerald",    display: "Emerald",    hue: "Green", shade: "Medium", shadeRank: 2 },
  { value: "olive green",display: "Olive Green",hue: "Green", shade: "Medium", shadeRank: 2 },
  { value: "light green",display: "Light Green",hue: "Green", shade: "Light",  shadeRank: 3 },
  { value: "sea green",  display: "Sea Green",  hue: "Green", shade: "Light",  shadeRank: 3 },
  { value: "mint",       display: "Mint",       hue: "Green", shade: "Light",  shadeRank: 3 },

  // Hazel — almost always medium
  { value: "hazel",        display: "Hazel",        hue: "Hazel", shade: "Medium", shadeRank: 2 },
  { value: "hazel green",  display: "Hazel Green",  hue: "Hazel", shade: "Medium", shadeRank: 2 },
  { value: "hazel brown",  display: "Hazel Brown",  hue: "Hazel", shade: "Medium", shadeRank: 2 },

  // Gray
  { value: "dark gray",  display: "Dark Gray",  hue: "Gray",  shade: "Dark",   shadeRank: 1 },
  { value: "slate",      display: "Slate",      hue: "Gray",  shade: "Dark",   shadeRank: 1 },
  { value: "gray",       display: "Gray",       hue: "Gray",  shade: "Medium", shadeRank: 2 },
  { value: "grey",       display: "Grey",       hue: "Gray",  shade: "Medium", shadeRank: 2 },
  { value: "silver",     display: "Silver",     hue: "Gray",  shade: "Light",  shadeRank: 3 },
  { value: "light gray", display: "Light Gray", hue: "Gray",  shade: "Light",  shadeRank: 3 },

  // Amber
  { value: "dark amber", display: "Dark Amber", hue: "Amber", shade: "Dark",   shadeRank: 1 },
  { value: "amber",      display: "Amber",      hue: "Amber", shade: "Medium", shadeRank: 2 },
  { value: "gold",       display: "Gold",       hue: "Amber", shade: "Medium", shadeRank: 2 },
  { value: "light amber",display: "Light Amber",hue: "Amber", shade: "Light",  shadeRank: 3 },

  // Violet
  { value: "violet", display: "Violet", hue: "Violet", shade: "Medium", shadeRank: 2 },
  { value: "purple", display: "Purple", hue: "Violet", shade: "Medium", shadeRank: 2 },

  // Other / mixed
  { value: "heterochromia", display: "Heterochromia", hue: "Other", shade: "Medium", shadeRank: 2 },
  { value: "mixed",         display: "Mixed",         hue: "Other", shade: "Medium", shadeRank: 2 },
];

// ─── SKIN (6 tones × 3 undertones) ──────────────────────────────────────────
// Tone (hue column):  Fair(1), Light(2), Medium(3), Tan(4), Deep(5), Ebony(6)
// Undertone (shade column): Cool, Warm, Neutral
export const SKIN_TONES: ColorCatalogEntry[] = [
  { value: "porcelain",   display: "Porcelain",   hue: "Fair",   shade: "Cool",    shadeRank: 1 },
  { value: "ivory",       display: "Ivory",       hue: "Fair",   shade: "Cool",    shadeRank: 1 },
  { value: "fair",        display: "Fair",        hue: "Fair",   shade: "Neutral", shadeRank: 1 },
  { value: "pale",        display: "Pale",        hue: "Fair",   shade: "Neutral", shadeRank: 1 },

  { value: "light",       display: "Light",       hue: "Light",  shade: "Neutral", shadeRank: 2 },
  { value: "beige",       display: "Beige",       hue: "Light",  shade: "Neutral", shadeRank: 2 },
  { value: "peach",       display: "Peach",       hue: "Light",  shade: "Warm",    shadeRank: 2 },

  { value: "medium",      display: "Medium",      hue: "Medium", shade: "Neutral", shadeRank: 3 },
  { value: "olive",       display: "Olive",       hue: "Medium", shade: "Warm",    shadeRank: 3 },
  { value: "golden",      display: "Golden",      hue: "Medium", shade: "Warm",    shadeRank: 3 },
  { value: "sun-kissed",  display: "Sun-Kissed",  hue: "Medium", shade: "Warm",    shadeRank: 3 },

  { value: "tan",         display: "Tan",         hue: "Tan",    shade: "Warm",    shadeRank: 4 },
  { value: "golden tan",  display: "Golden Tan",  hue: "Tan",    shade: "Warm",    shadeRank: 4 },
  { value: "caramel",     display: "Caramel",     hue: "Tan",    shade: "Warm",    shadeRank: 4 },
  { value: "bronze",      display: "Bronze",      hue: "Tan",    shade: "Warm",    shadeRank: 4 },

  { value: "deep",        display: "Deep",        hue: "Deep",   shade: "Warm",    shadeRank: 5 },
  { value: "mocha",       display: "Mocha",       hue: "Deep",   shade: "Warm",    shadeRank: 5 },
  { value: "dark brown",  display: "Dark Brown",  hue: "Deep",   shade: "Warm",    shadeRank: 5 },

  { value: "ebony",       display: "Ebony",       hue: "Ebony",  shade: "Warm",    shadeRank: 6 },
  { value: "very dark",   display: "Very Dark",   hue: "Ebony",  shade: "Warm",    shadeRank: 6 },
  { value: "espresso",    display: "Espresso",    hue: "Ebony",  shade: "Warm",    shadeRank: 6 },
  { value: "black",       display: "Black",       hue: "Ebony",  shade: "Neutral", shadeRank: 6 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const TABLES: Record<ColorCategory, ColorCatalogEntry[]> = {
  hair: HAIR_COLORS,
  eye:  EYE_COLORS,
  skin: SKIN_TONES,
};

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

export function getCatalogTable(category: ColorCategory): ColorCatalogEntry[] {
  return TABLES[category];
}

export function getCatalogEntry(category: ColorCategory, value: string | null | undefined): ColorCatalogEntry | null {
  if (!value) return null;
  const norm = normalize(value);
  return getCatalogTable(category).find((e) => e.value === norm) ?? null;
}

export function getHueForValue(category: ColorCategory, value: string | null | undefined): string | null {
  return getCatalogEntry(category, value)?.hue ?? null;
}

export function getShadeForValue(category: ColorCategory, value: string | null | undefined): string | null {
  return getCatalogEntry(category, value)?.shade ?? null;
}

export function getAllHues(category: ColorCategory): string[] {
  const seen = new Set<string>();
  for (const e of getCatalogTable(category)) seen.add(e.hue);
  return Array.from(seen);
}

export function getAllShades(category: ColorCategory): string[] {
  const seen = new Set<string>();
  for (const e of getCatalogTable(category)) if (e.shade) seen.add(e.shade);
  return Array.from(seen);
}

// Ordered axis labels for the sidebar UI (preserves dark→light ordering for
// hair/eye; tone is ordinal Fair→Ebony for skin). Hair/eye Lightness is
// ABSOLUTE — Dark means objectively dark, not "dark for the hue".
export const HAIR_LIGHTNESS_ORDER = ["Very Dark", "Dark", "Medium", "Light", "Very Light"] as const;
export const EYE_LIGHTNESS_ORDER  = ["Dark", "Medium", "Light"] as const;
export const SKIN_TONE_ORDER      = ["Fair", "Light", "Medium", "Tan", "Deep", "Ebony"] as const;
export const SKIN_UNDERTONE_ORDER = ["Cool", "Warm", "Neutral"] as const;

// ─── Heuristic auto-classification (for import / API paths) ─────────────────
//
// Used by ensureCatalogEntry when an unknown value arrives via import. Returns
// the best-guess (hue, shade, shadeRank) so the entry can be auto-added with
// needs_review = true. The admin can refine later in the Settings UI.

type HeuristicResult = {
  hue: string;
  shade: string | null;
  shadeRank: number | null;
};

const HAIR_SHADE_RANK_BY_MODIFIER: Array<[RegExp, string, number]> = [
  [/\bvery dark\b/, "Very Dark", 1],
  [/\bvery light\b/, "Very Light", 5],
  [/\bdark\b/,  "Dark",  2],
  [/\blight\b/, "Light", 4],
];

const HAIR_HUE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(black|raven|midnight|jet|ebony|onyx)\b/, "Black"],
  [/\b(brown|brunette|chestnut|chocolate|espresso|caramel|hazelnut|mahogany|walnut|honey|coffee)\b/, "Brown"],
  [/\b(blonde|blond|golden|honey|platinum|wheat|sandy|ash|bleached|strawberry blonde)\b/, "Blonde"],
  [/\b(red|ginger|copper|auburn|cherry|burgundy|henna)\b/, "Red"],
  [/\b(gray|grey|silver|salt|charcoal|pepper)\b/, "Gray"],
  [/\b(white|snow)\b/, "White"],
];

const EYE_HUE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(brown|amber brown|chestnut|chocolate|mocha)\b/, "Brown"],
  [/\b(blue|navy|sky|ocean|denim|baby blue|ice blue|midnight blue|steel)\b/, "Blue"],
  [/\b(green|emerald|olive|sea|mint)\b/, "Green"],
  [/\bhazel\b/, "Hazel"],
  [/\b(gray|grey|silver|slate)\b/, "Gray"],
  [/\b(amber|gold)\b/, "Amber"],
  [/\b(violet|purple)\b/, "Violet"],
  [/\b(heterochromia|mixed)\b/, "Other"],
];

const SKIN_TONE_PATTERNS: Array<[RegExp, string, number]> = [
  [/\b(fair|porcelain|ivory|pale)\b/,                    "Fair",   1],
  [/\b(light|beige|peach)\b/,                            "Light",  2],
  [/\b(medium|olive|golden|sun.?kissed)\b/,              "Medium", 3],
  [/\b(tan|golden tan|caramel|bronze)\b/,                "Tan",    4],
  [/\b(deep|deep brown|dark brown|mocha)\b/,             "Deep",   5],
  [/\b(ebony|very dark|black|espresso)\b/,               "Ebony",  6],
];

const SKIN_UNDERTONE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(cool|pink|rose|porcelain|ivory)\b/,               "Cool"],
  [/\b(warm|peach|olive|tan|caramel|golden|bronze)\b/,   "Warm"],
];

export function inferHairColor(value: string): HeuristicResult {
  const v = normalize(value);

  // Hue
  let hue = "Other";
  for (const [re, h] of HAIR_HUE_PATTERNS) {
    if (re.test(v)) { hue = h; break; }
  }

  // Shade: explicit modifier wins; otherwise pin to hue's natural shade
  let shade: string | null = null;
  let rank: number | null = null;
  for (const [re, s, r] of HAIR_SHADE_RANK_BY_MODIFIER) {
    if (re.test(v)) { shade = s; rank = r; break; }
  }
  if (shade == null) {
    if (hue === "Black") { shade = "Very Dark"; rank = 1; }
    else if (hue === "White") { shade = "Very Light"; rank = 5; }
    else { shade = "Medium"; rank = 3; }
  }

  return { hue, shade, shadeRank: rank };
}

export function inferEyeColor(value: string): HeuristicResult {
  const v = normalize(value);

  let hue = "Other";
  for (const [re, h] of EYE_HUE_PATTERNS) {
    if (re.test(v)) { hue = h; break; }
  }

  let shade: string;
  let rank: number;
  if (/\bdark\b/.test(v))      { shade = "Dark";   rank = 1; }
  else if (/\blight\b/.test(v)) { shade = "Light";  rank = 3; }
  else                          { shade = "Medium"; rank = 2; }

  return { hue, shade, shadeRank: rank };
}

export function inferSkinTone(value: string): HeuristicResult {
  const v = normalize(value);

  let tone = "Medium";
  let rank: number = 3;
  for (const [re, t, r] of SKIN_TONE_PATTERNS) {
    if (re.test(v)) { tone = t; rank = r; break; }
  }

  let undertone = "Neutral";
  for (const [re, u] of SKIN_UNDERTONE_PATTERNS) {
    if (re.test(v)) { undertone = u; break; }
  }

  return { hue: tone, shade: undertone, shadeRank: rank };
}

export function inferForCategory(category: ColorCategory, value: string): HeuristicResult {
  switch (category) {
    case "hair": return inferHairColor(value);
    case "eye":  return inferEyeColor(value);
    case "skin": return inferSkinTone(value);
  }
}

// ─── Seed row builder ───────────────────────────────────────────────────────

export type ColorCatalogRow = {
  category: ColorCategory;
  value_norm: string;
  display: string;
  hue: string;
  shade: string | null;
  shade_rank: number | null;
  sort_order: number;
  source: "seed";
};

export function buildColorCatalogRows(): ColorCatalogRow[] {
  const rows: ColorCatalogRow[] = [];
  for (const category of ["hair", "eye", "skin"] as ColorCategory[]) {
    const table = getCatalogTable(category);
    table.forEach((entry, idx) => {
      rows.push({
        category,
        value_norm: normalize(entry.value),
        display: entry.display,
        hue: entry.hue,
        shade: entry.shade ?? null,
        shade_rank: entry.shadeRank ?? null,
        sort_order: entry.sortOrder ?? idx,
        source: "seed",
      });
    });
  }
  return rows;
}
