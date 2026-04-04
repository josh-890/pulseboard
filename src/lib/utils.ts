import type React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 5)
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

/** Returns "Common Name (ICG-ID)" display string. */
export function getDisplayName(commonAlias: string | null, icgId: string): string {
  if (commonAlias) return `${commonAlias} (${icgId})`;
  return icgId;
}

/** Computes age in years from a birthdate. */
export function computeAge(birthdate: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthdate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthdate.getUTCDate())) {
    age--;
  }
  return age;
}

/** Formats a date with partial precision support. All dates are interpreted as UTC. */
export function formatPartialDate(date: Date | null, precision: string): string {
  if (!date || precision === "UNKNOWN") return "Unknown";
  if (precision === "YEAR") return date.getUTCFullYear().toString();
  if (precision === "MONTH") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Formats a Date to a UTC YYYY-MM-DD string suitable for form inputs. */
export function toUTCDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Computes age from a partial birthdate. Returns "~29" for imprecise dates, "29" for exact. */
export function computeAgeFromPartialDate(
  birthdate: Date | null,
  precision: string,
  asOf: Date = new Date(),
): string {
  if (!birthdate || precision === "UNKNOWN") return "Unknown";
  let age = asOf.getUTCFullYear() - birthdate.getUTCFullYear();
  if (precision === "DAY") {
    const monthDiff = asOf.getUTCMonth() - birthdate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < birthdate.getUTCDate())) {
      age--;
    }
    return age.toString();
  }
  return `~${age}`;
}

/** Computes age at a specific event, with "~" prefix when either date is imprecise. */
export function computeAgeAtEvent(
  birthdate: Date | null,
  birthPrec: string,
  eventDate: Date | null,
  eventPrec: string,
): string {
  if (!birthdate || !eventDate) return "Unknown";
  if (birthPrec === "UNKNOWN" || eventPrec === "UNKNOWN") return "Unknown";
  let age = eventDate.getUTCFullYear() - birthdate.getUTCFullYear();
  if (birthPrec === "DAY") {
    const monthDiff = eventDate.getUTCMonth() - birthdate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && eventDate.getUTCDate() < birthdate.getUTCDate())) {
      age--;
    }
  }
  if (birthPrec !== "DAY" || eventPrec !== "DAY") {
    return `~${age}`;
  }
  return age.toString();
}

/** Builds the default label for a baseline persona: "Name at 18", or "Name, initially". */
export function buildBaselineLabel(
  name: string,
  birthdate: Date | null,
  baselineDate: Date | null,
): string {
  if (!birthdate || !baselineDate) return `${name}, initially`;
  const age = baselineDate.getUTCFullYear() - birthdate.getUTCFullYear();
  return `${name} at ${age}`;
}

/** Returns the display prefix for a date modifier. */
export function getModifierSymbol(modifier?: string | null): string {
  if (!modifier || modifier === "EXACT") return "";
  const symbols: Record<string, string> = {
    APPROXIMATE: "~",
    ESTIMATED: "est. ",
    BEFORE: "before ",
    AFTER: "after ",
  };
  return symbols[modifier] ?? "";
}

/** Formats a date with partial precision and optional modifier prefix. */
export function formatPartialDateWithModifier(
  date: Date | null,
  precision: string,
  modifier?: string | null,
): string {
  const base = formatPartialDate(date, precision);
  if (base === "Unknown") return base;
  return `${getModifierSymbol(modifier)}${base}`;
}

/** Computes age with modifier awareness. If any modifier ≠ EXACT, prefix with ~. */
export function computeAgeWithModifier(
  birthdate: Date | null,
  birthPrec: string,
  birthModifier?: string | null,
  asOf?: Date,
  asOfPrec?: string,
  asOfModifier?: string | null,
): string {
  const base = computeAgeFromPartialDate(birthdate, birthPrec, asOf);
  if (base === "Unknown") return base;
  // If any modifier is non-EXACT, ensure ~ prefix
  const hasUncertainty =
    (birthModifier && birthModifier !== "EXACT") ||
    (asOfModifier && asOfModifier !== "EXACT");
  if (hasUncertainty && !base.startsWith("~")) {
    return `~${base}`;
  }
  return base;
}

/** Returns inline style for focal-aware `object-position` on `object-cover` images. */
export function focalStyle(
  focalX: number | null | undefined,
  focalY: number | null | undefined,
): React.CSSProperties {
  if (focalX == null || focalY == null) return {};
  return { objectPosition: `${(focalX * 100).toFixed(1)}% ${(focalY * 100).toFixed(1)}%` };
}

/** Generates an ICG-ID from a display name and optional birthdate ISO string. */
export function generateIcgId(displayName: string, birthdate?: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0]?.[0] ?? "X").toUpperCase();
  const second = (parts.length > 1 ? parts[1]![0] : "X").toUpperCase();
  const yearDigits = birthdate && birthdate.length >= 4 ? birthdate.slice(2, 4) : "00";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${first}${second}-${yearDigits}@${rand}`;
}

/** Returns up to 2 initials from the first two words of a name. */
export function getInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

/**
 * Generate a short name / acronym for a channel name.
 *
 * Strategy:
 * - Multi-word: first letter of each word → "FemJoy Video" → "FJV"
 * - Single all-caps word: first + last consonant → "METCN" → "MC"
 * - Single mixed-case word: uppercase letters → "FemJoy" → "FJ"
 * - Single lowercase/short: first 2-3 chars → "indie" → "IND"
 * - Hyphenated: treat parts as words → "MC-NUDES" → "MCN"
 */
export function generateChannelShortName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ""

  // Split on whitespace or hyphens
  const parts = trimmed.split(/[\s-]+/).filter(Boolean)

  if (parts.length > 1) {
    // Multi-word: first letter of each part
    return parts.map((p) => p.charAt(0).toUpperCase()).join("")
  }

  const word = parts[0]

  // Check for camelCase / PascalCase (e.g. "FemJoy" → "FJ")
  const camelParts = word.match(/[A-Z][a-z]*/g)
  if (camelParts && camelParts.length > 1) {
    return camelParts.map((p) => p.charAt(0).toUpperCase()).join("")
  }

  // All uppercase: take first 2-3 chars
  if (word === word.toUpperCase() && word.length > 3) {
    return word.slice(0, 3)
  }

  // Fallback: first 2 characters
  return word.slice(0, 2).toUpperCase()
}
