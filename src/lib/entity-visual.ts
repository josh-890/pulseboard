// ---------------------------------------------------------------------------
// Entity Visual Identity System
// ---------------------------------------------------------------------------
// Generates deterministic visual identity from a seed string.
// Design target: Linear / Stripe / Vercel — calm, structured, premium.
// ---------------------------------------------------------------------------

export type EntityCategory = "LABEL" | "CHANNEL" | "NETWORK";

export type EntityVisual = {
  /** 1–2 uppercase letters derived from the entity name */
  monogram: string;
  /** 0–3, deterministic colour variant within the category palette */
  colorVariant: number;
  /** 0–3, reserved for future decorative pattern selection */
  patternVariant: number;
  /** Tailwind class(es) for the badge background */
  badgeBg: string;
  /** Tailwind class(es) for the badge text */
  badgeText: string;
  /** Tailwind class for the left accent border colour */
  accentBorder: string;
  /** Tailwind gradient classes for the very-low-opacity card tint */
  cardGradient: string;
};

// ---------------------------------------------------------------------------
// Stable hash — FNV-1a 32-bit, fast and well-distributed
// ---------------------------------------------------------------------------
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0; // keep unsigned 32-bit
  }
  return h;
}

// ---------------------------------------------------------------------------
// Monogram — up to 2 letters, deterministic
// ---------------------------------------------------------------------------
const SKIP_WORDS = /^(the|a|an|of|in|at|by|for|on|to|and|or|&)$/i;

export function getMonogram(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-–_/&]+/)
    .filter(Boolean)
    .filter((w) => !SKIP_WORDS.test(w));

  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words[0]?.length >= 2) return words[0].slice(0, 2).toUpperCase();
  return (name.trim().slice(0, 2) || "??").toUpperCase();
}

// ---------------------------------------------------------------------------
// Title resolution — displayTitle > brandTitle > name
// ---------------------------------------------------------------------------
export function getEntityTitle(entity: {
  name: string;
  displayTitle?: string | null;
  brandTitle?: string | null;
}): string {
  return entity.displayTitle ?? entity.brandTitle ?? entity.name;
}

// ---------------------------------------------------------------------------
// Seed resolution — visualSeed > displayTitle > brandTitle > name > id
// ---------------------------------------------------------------------------
export function getEntitySeed(entity: {
  id: string;
  name: string;
  visualSeed?: string | null;
  displayTitle?: string | null;
  brandTitle?: string | null;
}): string {
  return entity.visualSeed ?? entity.displayTitle ?? entity.brandTitle ?? entity.name ?? entity.id;
}

// ---------------------------------------------------------------------------
// Colour palettes
// All classes must appear as complete string literals here so Tailwind JIT
// can scan and include them in the generated stylesheet.
// ---------------------------------------------------------------------------

type PaletteEntry = {
  badgeBg: string;
  badgeText: string;
  accentBorder: string;
  cardGradient: string;
};

// Amber / orange family — Labels
// Channel blue / sky / indigo family — Channels
// Emerald / teal / green family — Networks
const PALETTES: Record<EntityCategory, PaletteEntry[]> = {
  LABEL: [
    {
      badgeBg: "bg-amber-500/10 dark:bg-amber-500/15",
      badgeText: "text-amber-700 dark:text-amber-400",
      accentBorder: "border-l-amber-400/80",
      cardGradient: "from-amber-500/5 to-transparent",
    },
    {
      badgeBg: "bg-orange-500/10 dark:bg-orange-500/15",
      badgeText: "text-orange-700 dark:text-orange-400",
      accentBorder: "border-l-orange-400/80",
      cardGradient: "from-orange-500/5 to-transparent",
    },
    {
      badgeBg: "bg-yellow-500/10 dark:bg-yellow-500/15",
      badgeText: "text-yellow-700 dark:text-yellow-400",
      accentBorder: "border-l-yellow-400/80",
      cardGradient: "from-yellow-500/5 to-transparent",
    },
    {
      badgeBg: "bg-amber-600/10 dark:bg-amber-600/15",
      badgeText: "text-amber-800 dark:text-amber-300",
      accentBorder: "border-l-amber-500/80",
      cardGradient: "from-amber-600/5 to-transparent",
    },
  ],
  CHANNEL: [
    {
      badgeBg: "bg-blue-500/10 dark:bg-blue-500/15",
      badgeText: "text-blue-700 dark:text-blue-400",
      accentBorder: "border-l-blue-400/80",
      cardGradient: "from-blue-500/5 to-transparent",
    },
    {
      badgeBg: "bg-sky-500/10 dark:bg-sky-500/15",
      badgeText: "text-sky-700 dark:text-sky-400",
      accentBorder: "border-l-sky-400/80",
      cardGradient: "from-sky-500/5 to-transparent",
    },
    {
      badgeBg: "bg-indigo-500/10 dark:bg-indigo-500/15",
      badgeText: "text-indigo-700 dark:text-indigo-400",
      accentBorder: "border-l-indigo-400/80",
      cardGradient: "from-indigo-500/5 to-transparent",
    },
    {
      badgeBg: "bg-cyan-500/10 dark:bg-cyan-500/15",
      badgeText: "text-cyan-700 dark:text-cyan-400",
      accentBorder: "border-l-cyan-400/80",
      cardGradient: "from-cyan-500/5 to-transparent",
    },
  ],
  NETWORK: [
    {
      badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      badgeText: "text-emerald-700 dark:text-emerald-400",
      accentBorder: "border-l-emerald-400/80",
      cardGradient: "from-emerald-500/5 to-transparent",
    },
    {
      badgeBg: "bg-teal-500/10 dark:bg-teal-500/15",
      badgeText: "text-teal-700 dark:text-teal-400",
      accentBorder: "border-l-teal-400/80",
      cardGradient: "from-teal-500/5 to-transparent",
    },
    {
      badgeBg: "bg-green-500/10 dark:bg-green-500/15",
      badgeText: "text-green-700 dark:text-green-400",
      accentBorder: "border-l-green-400/80",
      cardGradient: "from-green-500/5 to-transparent",
    },
    {
      badgeBg: "bg-emerald-600/10 dark:bg-emerald-600/15",
      badgeText: "text-emerald-800 dark:text-emerald-300",
      accentBorder: "border-l-emerald-500/80",
      cardGradient: "from-emerald-600/5 to-transparent",
    },
  ],
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function generateEntityVisual(
  seed: string,
  category: EntityCategory,
): EntityVisual {
  const hash = fnv1a(seed);
  const palette = PALETTES[category];
  const colorVariant = hash % palette.length;
  const patternVariant = (hash >>> 8) % 4;

  return {
    monogram: getMonogram(seed),
    colorVariant,
    patternVariant,
    ...palette[colorVariant],
  };
}
