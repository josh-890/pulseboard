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
 *
 * Support (2026-10-24): someone only appearing (role presence SUPPORT) is the
 * reverse — shown only where a `MediaItemShownPerson` row says so. The whole
 * rule is `imageShownIds` in `@/lib/image-shown`.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { LEAD_ROLE, SUPPORT_ROLE } from "./session-contributors";

/**
 * Resolve a shown-person set from a cast + its exclusions. Pure + exported so the
 * gallery read path and the unit tests share one definition.
 */
export function computeShownIds(castIds: string[], hiddenIds: Iterable<string>): string[] {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  return castIds.filter((id) => !hidden.has(id));
}

/**
 * The default cast per session: the leads' `SessionContribution` Persons (deduped)
 * — on camera, presence LEAD. Returns a map keyed by every requested sessionId
 * (empty array when a session has no leads).
 */
export function getLeadCastForSessions(sessionIds: string[]): Promise<Map<string, string[]>> {
  return castForSessions(sessionIds, LEAD_ROLE);
}

/** Support per session: on camera, presence SUPPORT — shown only where marked */
export function getSupportCastForSessions(sessionIds: string[]): Promise<Map<string, string[]>> {
  return castForSessions(sessionIds, SUPPORT_ROLE);
}

async function castForSessions(
  sessionIds: string[],
  role: typeof LEAD_ROLE | typeof SUPPORT_ROLE,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of sessionIds) map.set(id, []);
  if (sessionIds.length === 0) return map;

  const rows = await prisma.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds }, roleDefinition: role },
    select: {
      sessionId: true,
      personId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>(); // `${sessionId}|${personId}`
  for (const r of rows) {
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

/** Support marked as shown per image: map keyed by every requested mediaItemId. */
export async function getShownSupportForMedia(mediaItemIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of mediaItemIds) map.set(id, []);
  if (mediaItemIds.length === 0) return map;
  const rows = await prisma.mediaItemShownPerson.findMany({
    where: { mediaItemId: { in: mediaItemIds } },
    select: { mediaItemId: true, personId: true },
  });
  for (const r of rows) map.get(r.mediaItemId)?.push(r.personId);
  return map;
}

/** Replace who of the support one image shows. Empty array = none of them. */
export async function setShownSupport(mediaItemId: string, personIds: string[]): Promise<void> {
  const unique = [...new Set(personIds)];
  await prisma.$transaction(async (tx) => {
    await tx.mediaItemShownPerson.deleteMany({ where: { mediaItemId } });
    if (unique.length > 0) {
      await tx.mediaItemShownPerson.createMany({
        data: unique.map((personId) => ({ mediaItemId, personId })),
        skipDuplicates: true,
      });
    }
  });
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
 * Bulk HIDE people across many images (add exclusions; support: unmark). Add/remove
 * semantics — not replace — so it behaves sanely across images from different sessions.
 */
export async function bulkHidePersons(
  mediaItemIds: string[],
  personIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0 || personIds.length === 0) return;
  const data = mediaItemIds.flatMap((mediaItemId) =>
    personIds.map((personId) => ({ mediaItemId, personId })),
  );
  await prisma.$transaction([
    prisma.mediaItemHiddenPerson.createMany({ data, skipDuplicates: true }),
    prisma.mediaItemShownPerson.deleteMany({
      where: { mediaItemId: { in: mediaItemIds }, personId: { in: personIds } },
    }),
  ]);
}

/**
 * Bulk SHOW people across many images (remove exclusions; support: mark shown —
 * only where the person is support in that image's session).
 */
export async function bulkShowPersons(
  mediaItemIds: string[],
  personIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0 || personIds.length === 0) return;
  await prisma.$transaction([
    prisma.mediaItemHiddenPerson.deleteMany({
      where: { mediaItemId: { in: mediaItemIds }, personId: { in: personIds } },
    }),
    prisma.$executeRaw`
      INSERT INTO media_item_shown_person ("mediaItemId", "personId")
      SELECT DISTINCT mi.id, sc."personId"
      FROM "MediaItem" mi
      JOIN "SessionContribution" sc ON sc."sessionId" = mi."sessionId"
      JOIN "ContributionRoleDefinition" rd ON rd.id = sc."roleDefinitionId"
      JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
      WHERE mi.id IN (${Prisma.join(mediaItemIds)}) AND sc."personId" IN (${Prisma.join(personIds)})
        AND rg.kind = 'ON_CAMERA' AND rd.presence = 'SUPPORT'
      ON CONFLICT DO NOTHING`,
  ]);
}
