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
 *
 * Focus (ADR-0039, 2026-11-17): a shown person is the image's focus or only in
 * the shot. A lead is the focus unless a `MediaItemBackgroundPerson` row says
 * otherwise; someone appearing only where their `MediaItemShownPerson` row has
 * `focus`. Only the curated views (the showcase) read it — `imageFocusIds`.
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

/**
 * The focus marks per image (ADR-0039): leads only in the shot, and support
 * marked as the focus. Both maps keyed by every requested mediaItemId.
 */
export async function getFocusMarksForMedia(
  mediaItemIds: string[],
): Promise<{ background: Map<string, string[]>; focusSupport: Map<string, string[]> }> {
  const background = new Map<string, string[]>();
  const focusSupport = new Map<string, string[]>();
  for (const id of mediaItemIds) {
    background.set(id, []);
    focusSupport.set(id, []);
  }
  if (mediaItemIds.length === 0) return { background, focusSupport };
  const [bg, fs] = await Promise.all([
    prisma.mediaItemBackgroundPerson.findMany({
      where: { mediaItemId: { in: mediaItemIds } },
      select: { mediaItemId: true, personId: true },
    }),
    prisma.mediaItemShownPerson.findMany({
      where: { mediaItemId: { in: mediaItemIds }, focus: true },
      select: { mediaItemId: true, personId: true },
    }),
  ]);
  for (const r of bg) background.get(r.mediaItemId)?.push(r.personId);
  for (const r of fs) focusSupport.get(r.mediaItemId)?.push(r.personId);
  return { background, focusSupport };
}

/**
 * Replace who of the support one image shows. Empty array = none of them.
 * `focusIds` = who of them is the focus (ADR-0039); left out, everyone still
 * shown keeps the focus mark they had.
 */
export async function setShownSupport(
  mediaItemId: string,
  personIds: string[],
  focusIds?: string[],
): Promise<void> {
  const unique = [...new Set(personIds)];
  await prisma.$transaction(async (tx) => {
    const focus = new Set(
      focusIds ??
        (
          await tx.mediaItemShownPerson.findMany({
            where: { mediaItemId, focus: true },
            select: { personId: true },
          })
        ).map((r) => r.personId),
    );
    await tx.mediaItemShownPerson.deleteMany({ where: { mediaItemId } });
    if (unique.length > 0) {
      await tx.mediaItemShownPerson.createMany({
        data: unique.map((personId) => ({ mediaItemId, personId, focus: focus.has(personId) })),
        skipDuplicates: true,
      });
    }
  });
}

/**
 * Replace the leads of one image who are only in the shot, not its focus
 * (ADR-0039). Empty array = every shown lead is the focus. In the shot means
 * shown: a lead marked here loses an exclusion they had.
 */
export async function setBackgroundPersons(mediaItemId: string, personIds: string[]): Promise<void> {
  const unique = [...new Set(personIds)];
  await prisma.$transaction(async (tx) => {
    await tx.mediaItemBackgroundPerson.deleteMany({ where: { mediaItemId } });
    if (unique.length === 0) return;
    await tx.mediaItemHiddenPerson.deleteMany({ where: { mediaItemId, personId: { in: unique } } });
    await tx.mediaItemBackgroundPerson.createMany({
      data: unique.map((personId) => ({ mediaItemId, personId })),
      skipDuplicates: true,
    });
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
      // Not shown wins over "only in the shot" (ADR-0039)
      await tx.mediaItemBackgroundPerson.deleteMany({ where: { mediaItemId, personId: { in: unique } } });
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
    prisma.mediaItemBackgroundPerson.deleteMany({
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

/**
 * Bulk Focus / In shot across many images (ADR-0039). Both also show the person:
 * a lead loses their exclusion, someone appearing gets a shown mark — only where
 * they are support in that image's session. "focus": a lead loses the background
 * mark, support is marked as the focus. "background": a lead gets the background
 * mark (only where they lead that image's session), support is shown, not the focus.
 */
export async function bulkSetFocus(
  mediaItemIds: string[],
  personIds: string[],
  mode: "focus" | "background",
): Promise<void> {
  if (mediaItemIds.length === 0 || personIds.length === 0) return;
  const focus = mode === "focus";
  const where = { mediaItemId: { in: mediaItemIds }, personId: { in: personIds } };
  const onCamera = (presence: "LEAD" | "SUPPORT") => Prisma.sql`
      FROM "MediaItem" mi
      JOIN "SessionContribution" sc ON sc."sessionId" = mi."sessionId"
      JOIN "ContributionRoleDefinition" rd ON rd.id = sc."roleDefinitionId"
      JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
      WHERE mi.id IN (${Prisma.join(mediaItemIds)}) AND sc."personId" IN (${Prisma.join(personIds)})
        AND rg.kind = 'ON_CAMERA' AND rd.presence = ${presence}::"RolePresence"`;
  await prisma.$transaction([
    prisma.mediaItemHiddenPerson.deleteMany({ where }),
    focus
      ? prisma.mediaItemBackgroundPerson.deleteMany({ where })
      : prisma.$executeRaw`
      INSERT INTO media_item_background_person ("mediaItemId", "personId")
      SELECT DISTINCT mi.id, sc."personId" ${onCamera("LEAD")}
      ON CONFLICT DO NOTHING`,
    prisma.$executeRaw`
      INSERT INTO media_item_shown_person ("mediaItemId", "personId", focus)
      SELECT DISTINCT mi.id, sc."personId", ${focus}::boolean ${onCamera("SUPPORT")}
      ON CONFLICT ("mediaItemId", "personId") DO UPDATE SET focus = EXCLUDED.focus`,
  ]);
}
