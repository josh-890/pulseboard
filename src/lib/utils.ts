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

/** Returns up to 2 initials from the first two words of a name. */
export function getInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}
