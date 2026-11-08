import { fnv1a, getMonogram } from "@/lib/entity-visual";

// ---------------------------------------------------------------------------
// Brand marks for channels, labels and artists
// ---------------------------------------------------------------------------
// Most channels never get a logo, so the generated mark has to stand on its
// own: the name set in one of a few display fonts, in one of 16 colours — both
// picked from the name (stable), each overridable per entity. An uploaded logo
// wins over both. All classes are complete literals so Tailwind can see them.
// ---------------------------------------------------------------------------

export type BrandFont = {
  key: string;
  label: string;
  /** font-family class (globals.css) + the casing/tracking that suits it */
  className: string;
};

export const BRAND_FONTS: BrandFont[] = [
  { key: "serif", label: "Serif", className: "brand-font-serif" },
  { key: "didone", label: "Fat serif", className: "brand-font-didone" },
  { key: "condensed", label: "Condensed", className: "brand-font-condensed uppercase tracking-wide" },
  { key: "grotesk", label: "Grotesk", className: "brand-font-grotesk tracking-tight" },
  { key: "geometric", label: "Geometric", className: "brand-font-geometric uppercase tracking-tight" },
  { key: "rounded", label: "Rounded", className: "brand-font-rounded" },
  { key: "script", label: "Script", className: "brand-font-script" },
  { key: "elegant", label: "Elegant", className: "brand-font-elegant uppercase tracking-[0.14em]" },
];

export type BrandColor = {
  key: string;
  label: string;
  /** wordmark / monogram text */
  text: string;
  /** monogram tile background */
  tileBg: string;
  /** picker swatch */
  swatch: string;
};

export const BRAND_COLORS: BrandColor[] = [
  { key: "rose", label: "Rose", text: "text-rose-600 dark:text-rose-400", tileBg: "bg-rose-500/15", swatch: "bg-rose-500" },
  { key: "pink", label: "Pink", text: "text-pink-600 dark:text-pink-400", tileBg: "bg-pink-500/15", swatch: "bg-pink-500" },
  { key: "fuchsia", label: "Fuchsia", text: "text-fuchsia-600 dark:text-fuchsia-400", tileBg: "bg-fuchsia-500/15", swatch: "bg-fuchsia-500" },
  { key: "purple", label: "Purple", text: "text-purple-600 dark:text-purple-400", tileBg: "bg-purple-500/15", swatch: "bg-purple-500" },
  { key: "violet", label: "Violet", text: "text-violet-600 dark:text-violet-400", tileBg: "bg-violet-500/15", swatch: "bg-violet-500" },
  { key: "indigo", label: "Indigo", text: "text-indigo-600 dark:text-indigo-400", tileBg: "bg-indigo-500/15", swatch: "bg-indigo-500" },
  { key: "blue", label: "Blue", text: "text-blue-600 dark:text-blue-400", tileBg: "bg-blue-500/15", swatch: "bg-blue-500" },
  { key: "sky", label: "Sky", text: "text-sky-600 dark:text-sky-400", tileBg: "bg-sky-500/15", swatch: "bg-sky-500" },
  { key: "cyan", label: "Cyan", text: "text-cyan-600 dark:text-cyan-400", tileBg: "bg-cyan-500/15", swatch: "bg-cyan-500" },
  { key: "teal", label: "Teal", text: "text-teal-600 dark:text-teal-400", tileBg: "bg-teal-500/15", swatch: "bg-teal-500" },
  { key: "emerald", label: "Emerald", text: "text-emerald-600 dark:text-emerald-400", tileBg: "bg-emerald-500/15", swatch: "bg-emerald-500" },
  { key: "green", label: "Green", text: "text-green-600 dark:text-green-400", tileBg: "bg-green-500/15", swatch: "bg-green-500" },
  { key: "yellow", label: "Yellow", text: "text-yellow-600 dark:text-yellow-300", tileBg: "bg-yellow-500/15", swatch: "bg-yellow-400" },
  { key: "amber", label: "Amber", text: "text-amber-600 dark:text-amber-400", tileBg: "bg-amber-500/15", swatch: "bg-amber-500" },
  { key: "orange", label: "Orange", text: "text-orange-600 dark:text-orange-400", tileBg: "bg-orange-500/15", swatch: "bg-orange-500" },
  { key: "red", label: "Red", text: "text-red-600 dark:text-red-400", tileBg: "bg-red-500/15", swatch: "bg-red-500" },
];

const FONT_BY_KEY = new Map(BRAND_FONTS.map((f) => [f.key, f]));
const COLOR_BY_KEY = new Map(BRAND_COLORS.map((c) => [c.key, c]));

export function isBrandFontKey(key: string): boolean {
  return FONT_BY_KEY.has(key);
}

export function isBrandColorKey(key: string): boolean {
  return COLOR_BY_KEY.has(key);
}

/** What any brand mark needs — small enough to pass to client components */
export type EntityBrand = {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  markFont?: string | null;
  markColor?: string | null;
};

export type ResolvedBrandMark = {
  font: BrandFont;
  color: BrandColor;
  /** Shortname when it is short enough for a tile, else initials from the name */
  monogram: string;
  /** The generated pick (what "Reset" goes back to) */
  generatedFontKey: string;
  generatedColorKey: string;
};

export function resolveBrandMark(brand: EntityBrand): ResolvedBrandMark {
  const hash = fnv1a(brand.name.trim().toLowerCase());
  const generatedFont = BRAND_FONTS[hash % BRAND_FONTS.length];
  const generatedColor = BRAND_COLORS[(hash >>> 8) % BRAND_COLORS.length];
  const short = brand.shortName?.trim();
  return {
    font: (brand.markFont && FONT_BY_KEY.get(brand.markFont)) || generatedFont,
    color: (brand.markColor && COLOR_BY_KEY.get(brand.markColor)) || generatedColor,
    monogram: short && short.length <= 5 ? short.toUpperCase() : getMonogram(brand.name),
    generatedFontKey: generatedFont.key,
    generatedColorKey: generatedColor.key,
  };
}
