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
  let age = now.getFullYear() - birthdate.getFullYear();
  const monthDiff = now.getMonth() - birthdate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthdate.getDate())) {
    age--;
  }
  return age;
}

/** Formats a date with partial precision support. */
export function formatPartialDate(date: Date | null, precision: string): string {
  if (!date || precision === "UNKNOWN") return "Unknown";
  if (precision === "YEAR") return date.getFullYear().toString();
  if (precision === "MONTH") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Computes age from a partial birthdate. Returns "~29" for imprecise dates, "29" for exact. */
export function computeAgeFromPartialDate(
  birthdate: Date | null,
  precision: string,
  asOf: Date = new Date(),
): string {
  if (!birthdate || precision === "UNKNOWN") return "Unknown";
  let age = asOf.getFullYear() - birthdate.getFullYear();
  if (precision === "DAY") {
    const monthDiff = asOf.getMonth() - birthdate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birthdate.getDate())) {
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
  let age = eventDate.getFullYear() - birthdate.getFullYear();
  if (birthPrec === "DAY") {
    const monthDiff = eventDate.getMonth() - birthdate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && eventDate.getDate() < birthdate.getDate())) {
      age--;
    }
  }
  if (birthPrec !== "DAY" || eventPrec !== "DAY") {
    return `~${age}`;
  }
  return age.toString();
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
