/**
 * Escaping for Prisma's `startsWith` / `contains` / `endsWith` string filters.
 *
 * Those compile to SQL `LIKE`, and Prisma passes the value through verbatim — it
 * does NOT escape LIKE metacharacters. On PostgreSQL the default LIKE escape
 * character is the backslash, which makes Windows paths silently unmatchable:
 *
 *   { fullPath: { startsWith: 'I:\\Sites\\FJ-FemJoy' } }  ->  0 rows
 *   { fullPath: { startsWith: escapeLike('I:\\Sites\\FJ-FemJoy') } }  ->  11,506 rows
 *
 * It fails *silently* — an empty result is indistinguishable from "nothing
 * matched" — so any filter over a path column has to go through this.
 *
 * `%` and `_` matter too: an unescaped `_` in a folder name is a single-character
 * wildcard, which quietly over-matches rather than under-matching.
 */

/** Escape backslash, % and _ so the value is matched literally by LIKE. */
export function escapeLike(value: string): string {
  // Backslash first — escaping it after the others would double-escape their
  // freshly-added backslashes.
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
}
