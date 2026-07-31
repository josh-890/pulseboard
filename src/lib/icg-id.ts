/**
 * ICG-ID — the canonical Person key. See ADR-0026.
 *
 * Two kinds share one shape:
 *
 *   External  XX-NN<S>    S ∈ [A-Z0-9]{1,4}   e.g. CX-82HO, AY-006S, CR-00KI7
 *   Local     XX-NN@RRR   R ∈ [A-Z0-9]        e.g. JD-95@K7R
 *             │  │ │
 *             │  │ └─ marker '@' at index 5. Reserved — external IDs never contain it.
 *             │  └─── last two digits of the birth year; '00' when unknown at mint time.
 *             └────── initials of the first two words of the common name; 'X' for a
 *                     missing second word.
 *
 * External IDs mirror an outside database and are a free, guaranteed-unique join
 * key. People absent from that database get a locally minted ID instead. The
 * reserved marker is what makes the two namespaces provably disjoint: no ID the
 * external database can ever issue will collide with one minted here, and the
 * origin of any ID is readable from the string alone (no extra column to drift).
 *
 * An ICG-ID is minted once from what was known at first sighting and is never
 * re-derived — AX-0025 belongs to Anna-Leah (b. 1985; the year was learned after
 * minting) and CX-00L3 to Katya Clover (renamed since). Do not "fix" a prefix.
 */

/** Reserved character marking a locally minted ICG-ID. */
export const ICG_LOCAL_MARKER = "@";

/**
 * Which namespace an ICG-ID comes from. "self" = minted here because the person
 * is absent from the external database. Tuple form is for `z.enum`.
 */
export const ICG_ID_ORIGINS_TUPLE = ["external", "self"] as const;
export const ICG_ID_ORIGINS: readonly string[] = ICG_ID_ORIGINS_TUPLE;
export type IcgIdOrigin = (typeof ICG_ID_ORIGINS_TUPLE)[number];

/** Either kind. The permissive form — use for stored values of unknown origin. */
export const ICG_ID_RE = /^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$/;

/** External IDs only — the marker is rejected. */
export const ICG_ID_EXTERNAL_RE = /^[A-Z]{2}-[0-9]{2}[A-Z0-9]{2,4}$/;

/** Locally minted IDs only, in the shape this module produces. */
export const ICG_ID_LOCAL_RE = /^[A-Z]{2}-[0-9]{2}@[A-Z0-9]{3}$/;

/** Shown in form errors and placeholders. */
export const ICG_ID_FORMAT_HINT = "Format: XX-00XXX  e.g. JD-96ABF";

const SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LOCAL_SUFFIX_LENGTH = 3;

/**
 * True when the ID was minted locally (i.e. the person is not in the external
 * database). Deliberately looser than ICG_ID_LOCAL_RE: it reads the marker
 * anywhere in the string, so a misshapen value is still classified rather than
 * silently counted as external. Flagging the shape is the audit's job.
 */
export function isSelfAssignedIcgId(icgId: string): boolean {
  return icgId.includes(ICG_LOCAL_MARKER);
}

/** Strips diacritics so accented initials survive as plain A-Z. */
function foldToAscii(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** First A-Z character of a word, or `fallback` when it has none. */
function initialOf(word: string | undefined, fallback: string): string {
  if (!word) return fallback;
  const char = foldToAscii(word).toUpperCase().match(/[A-Z]/)?.[0];
  return char ?? fallback;
}

/**
 * Derives the fixed part of an ICG-ID — initials plus birth-year digits, e.g.
 * "JD-95". `birthdate` is an ISO date string; anything else yields the "00"
 * unknown-year sentinel.
 */
export function icgIdPrefix(displayName: string, birthdate?: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const first = initialOf(words[0], "X");
  const second = words.length > 1 ? initialOf(words[1], "X") : "X";
  const year = birthdate?.match(/^\d{4}/)?.[0];
  const yearDigits = year ? year.slice(2) : "00";
  return `${first}${second}-${yearDigits}`;
}

/**
 * One candidate local ICG-ID for a prefix from `icgIdPrefix`. Random, so the
 * caller must probe it for uniqueness before use — see `mintIcgIdAction`.
 */
export function mintLocalIcgIdCandidate(prefix: string): string {
  let suffix = "";
  for (let i = 0; i < LOCAL_SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return `${prefix}${ICG_LOCAL_MARKER}${suffix}`;
}
