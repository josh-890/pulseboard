/**
 * Session-contributor union (ADR-0021).
 *
 * A Session's contributor list is a union of two kinds:
 *   - on-camera **Person** contributions (`SessionContribution`, Person-only), and
 *   - behind-camera **Artist** credits derived (read-only) from the session's sets
 *     (`SetSession → Set → SetCreditRaw` where the role group is Behind-Camera).
 *
 * Contributor *kind* is a deterministic function of the credit's **role group**.
 * These helpers are pure so the rule + the merge/dedup are tested without a DB.
 * See `docs/artist-session-contributors-plan.md`.
 */

/**
 * A role group's kind (2026-10-24) — fixed, so renaming a group never changes
 * what it means. Behind-camera credits resolve to a lightweight Artist.
 */
export type RoleGroupKindName = "ON_CAMERA" | "BEHIND_CAMERA";

export type ContributorKind = "person" | "artist";

/** On-Camera → person; Behind-Camera → artist. */
export function contributorKindForRoleGroup(kind: RoleGroupKindName | string): ContributorKind {
  return kind === "BEHIND_CAMERA" ? "artist" : "person";
}

// Prisma `where` on a role definition (2026-10-24): who is in front of the
// camera, who takes part (LEAD) and who only appears (SUPPORT, e.g. Appearance)
export const ON_CAMERA_ROLE = { group: { kind: "ON_CAMERA" as const } };
export const BEHIND_CAMERA_ROLE = { group: { kind: "BEHIND_CAMERA" as const } };
export const LEAD_ROLE = { group: { kind: "ON_CAMERA" as const }, presence: "LEAD" as const };
export const SUPPORT_ROLE = { group: { kind: "ON_CAMERA" as const }, presence: "SUPPORT" as const };

/** An on-camera Person contribution (from `SessionContribution`). */
export type PersonContributor = {
  kind: "person";
  personId: string;
  roleName: string;
  displayName: string;
};

/** A behind-camera credit on one of the session's sets (resolved Artist or raw). */
export type BehindCameraCredit = {
  artistId: string | null;
  resolvedArtistName: string | null;
  rawName: string;
  roleName: string;
};

export type SessionContributor =
  | PersonContributor
  | {
      kind: "artist";
      artistId: string | null;
      roleName: string;
      displayName: string;
    };

/**
 * Merge on-camera Person contributions with the session's behind-camera credits into
 * one contributor list. Persons pass through (already de-duped at the session level)
 * and lead; behind-camera Artists follow, de-duped per role by `artistId` (resolved)
 * or normalized raw name (unresolved). Behind-camera entries display the resolved
 * `Artist.name`, falling back to the raw credit name — so they appear whether or not
 * they've been resolved (ADR-0021).
 */
export function mergeSessionContributors(
  personContribs: PersonContributor[],
  behindCameraCredits: BehindCameraCredit[],
): SessionContributor[] {
  const artists: SessionContributor[] = [];
  const seen = new Set<string>();
  for (const c of behindCameraCredits) {
    const displayName = c.resolvedArtistName ?? c.rawName;
    const identity = c.artistId ?? `raw:${displayName.trim().toLowerCase()}`;
    const key = `${c.roleName}::${identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artists.push({ kind: "artist", artistId: c.artistId, roleName: c.roleName, displayName });
  }
  return [...personContribs, ...artists];
}

type WithPresence = { roleDefinition?: { presence?: string | null } | null };

/** Someone only appearing (support) — shown after the leads, subtly (2026-10-24) */
export function isSupport(p: WithPresence): boolean {
  return p.roleDefinition?.presence === "SUPPORT";
}

/** The leads first, then support — each in its own order */
export function leadsFirst<T extends WithPresence>(list: readonly T[]): T[] {
  return [...list.filter((p) => !isSupport(p)), ...list.filter(isSupport)];
}
