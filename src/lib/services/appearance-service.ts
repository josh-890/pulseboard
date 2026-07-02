/**
 * Per-image "people shown" appearance (ADR-0023).
 *
 * Appearance is a property of the MediaItem. The DEFAULT set of people shown in an
 * image is its session's on-camera cast (`SessionContribution` Persons, excluding the
 * Behind-Camera role group). We persist only the EXCLUSIONS — a `MediaItemHiddenPerson`
 * row marks a cast member who is NOT shown in that image:
 *
 *     shown(image) = onCameraCast(image.session) \ hidden(image)
 *
 * Absence of exclusion rows = all cast shown, so the default self-follows the live
 * cast (add a contribution → the person appears everywhere, no backfill).
 */

import { prisma } from "@/lib/db";
import { BEHIND_CAMERA_GROUP } from "./session-contributors";

/**
 * Resolve a shown-person set from a cast + its exclusions. Pure + exported so the
 * gallery read path and the unit tests share one definition.
 */
export function computeShownIds(castIds: string[], hiddenIds: Iterable<string>): string[] {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  return castIds.filter((id) => !hidden.has(id));
}

/**
 * The default cast per session: on-camera `SessionContribution` Persons (deduped),
 * excluding the Behind-Camera role group. Returns a map keyed by every requested
 * sessionId (empty array when a session has no on-camera contributions).
 */
export async function getOnCameraCastForSessions(
  sessionIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of sessionIds) map.set(id, []);
  if (sessionIds.length === 0) return map;

  const rows = await prisma.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds } },
    select: {
      sessionId: true,
      personId: true,
      roleDefinition: { select: { group: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>(); // `${sessionId}|${personId}`
  for (const r of rows) {
    if (r.roleDefinition?.group?.name === BEHIND_CAMERA_GROUP) continue;
    const key = `${r.sessionId}|${r.personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    map.get(r.sessionId)?.push(r.personId);
  }
  return map;
}

/** Exclusions per image: map keyed by every requested mediaItemId. */
export async function getHiddenPersonsForMedia(
  mediaItemIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of mediaItemIds) map.set(id, []);
  if (mediaItemIds.length === 0) return map;

  const rows = await prisma.mediaItemHiddenPerson.findMany({
    where: { mediaItemId: { in: mediaItemIds } },
    select: { mediaItemId: true, personId: true },
  });
  for (const r of rows) map.get(r.mediaItemId)?.push(r.personId);
  return map;
}

/**
 * Replace the exclusion set for one image (used by the lightbox per-image editor).
 * `personIds` = the people to HIDE. Empty array clears all exclusions (= all shown).
 */
export async function setHiddenPersons(
  mediaItemId: string,
  personIds: string[],
): Promise<void> {
  const unique = [...new Set(personIds)];
  await prisma.$transaction(async (tx) => {
    await tx.mediaItemHiddenPerson.deleteMany({ where: { mediaItemId } });
    if (unique.length > 0) {
      await tx.mediaItemHiddenPerson.createMany({
        data: unique.map((personId) => ({ mediaItemId, personId })),
        skipDuplicates: true,
      });
    }
  });
}

/**
 * Bulk HIDE people across many images (add exclusions). Add/remove semantics — not
 * replace — so it behaves sanely across images from different sessions.
 */
export async function bulkHidePersons(
  mediaItemIds: string[],
  personIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0 || personIds.length === 0) return;
  const data = mediaItemIds.flatMap((mediaItemId) =>
    personIds.map((personId) => ({ mediaItemId, personId })),
  );
  await prisma.mediaItemHiddenPerson.createMany({ data, skipDuplicates: true });
}

/** Bulk SHOW people across many images (remove exclusions). */
export async function bulkShowPersons(
  mediaItemIds: string[],
  personIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0 || personIds.length === 0) return;
  await prisma.mediaItemHiddenPerson.deleteMany({
    where: { mediaItemId: { in: mediaItemIds }, personId: { in: personIds } },
  });
}
