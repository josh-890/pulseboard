/**
 * Entity accent color keys — maps route prefixes to Tailwind color token names.
 * Usage: `bg-entity-session/15`, `text-entity-session`, `border-l-entity-session`.
 */

export type EntityKey =
  | "session"
  | "set"
  | "person"
  | "collection"
  | "project"
  | "label"
  | "channel"
  | "network";

/**
 * Maps a pathname to its entity key for accent coloring.
 * Returns undefined for non-entity routes (dashboard, settings).
 */
export function getEntityKeyForPath(pathname: string): EntityKey | undefined {
  if (pathname.startsWith("/sessions")) return "session";
  if (pathname.startsWith("/sets")) return "set";
  if (pathname.startsWith("/people")) return "person";
  if (pathname.startsWith("/collections")) return "collection";
  if (pathname.startsWith("/projects")) return "project";
  if (pathname.startsWith("/labels")) return "label";
  if (pathname.startsWith("/channels")) return "channel";
  if (pathname.startsWith("/networks")) return "network";
  return undefined;
}
