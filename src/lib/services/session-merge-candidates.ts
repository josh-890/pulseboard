import { prisma } from "@/lib/db";
import { buildPhotoUrls } from "@/lib/media-url";
import { resolveMergeDirection, type MergeDirection } from "@/lib/session-merge-direction";
import type { GalleryItem, SessionMergeCandidate, SessionMergeCard, SessionMergeComparison, SessionMergeReason } from "@/lib/types";
import { parsePhotoVariants } from "@/lib/types";
import { getDisplayName } from "@/lib/utils";
import { getSessionMediaGallery } from "./media-service";
import { BEHIND_CAMERA_GROUP } from "./session-contributors";

// Session merge suggestions (2026-10-18). Each set used to get its own session;
// a merge says two sets came from one shoot. Names are often no help ("Set 1"
// twice), so candidates come from what the sessions share — people on camera,
// the label, the project — and how close their sets were released, and each
// card shows the sets that were published from it.

const ON_CAMERA = { roleDefinition: { group: { name: { not: BEHIND_CAMERA_GROUP } } } };
const MAX_SUGGESTED = 20;
const MAX_SEARCHED = 50;
/** Label-/project-wide sessions considered for ranking — a label can hold hundreds */
const MAX_POOL = 600;
const DAY_MS = 86_400_000;

type SessionFacts = {
  id: string;
  personIds: Set<string>;
  labels: Map<string, string>; // id → name; the session's own and its sets' channel labels
  project: { id: string; name: string } | null;
  earliestRelease: Date | null;
};

async function loadFacts(ids: string[]): Promise<Map<string, SessionFacts>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.session.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      label: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      contributions: { where: ON_CAMERA, select: { personId: true } },
      setSessionLinks: {
        select: { set: { select: { releaseDate: true, channel: { select: { label: { select: { id: true, name: true } } } } } } },
      },
    },
  });
  return new Map(
    rows.map((s) => {
      const labels = new Map<string, string>();
      if (s.label) labels.set(s.label.id, s.label.name);
      let earliestRelease: Date | null = null;
      for (const { set } of s.setSessionLinks) {
        const l = set.channel?.label;
        if (l) labels.set(l.id, l.name);
        if (set.releaseDate && (!earliestRelease || set.releaseDate < earliestRelease)) earliestRelease = set.releaseDate;
      }
      return [
        s.id,
        { id: s.id, personIds: new Set(s.contributions.map((c) => c.personId)), labels, project: s.project, earliestRelease },
      ];
    }),
  );
}

/** Score + the people's ids behind it (named once the cards are loaded) */
function score(self: SessionFacts, other: SessionFacts) {
  const sharedPeople = [...other.personIds].filter((id) => self.personIds.has(id));
  const sharedLabel = [...other.labels].find(([id]) => self.labels.has(id));
  const sameProject = self.project && other.project?.id === self.project.id ? self.project : null;
  const days =
    self.earliestRelease && other.earliestRelease
      ? Math.round(Math.abs(self.earliestRelease.getTime() - other.earliestRelease.getTime()) / DAY_MS)
      : null;
  const closeness = days === null ? 0 : days <= 30 ? 2 : days <= 90 ? 1 : 0;
  return {
    score: 3 * sharedPeople.length + (sharedLabel ? 2 : 0) + (sameProject ? 1 : 0) + closeness,
    sharedPeople,
    labelName: sharedLabel?.[1] ?? null,
    projectName: sameProject?.name ?? null,
    days: closeness > 0 ? days : null,
  };
}

function thumb(media: { variants: unknown; fileRef: string | null } | null): string | null {
  const v = media ? parsePhotoVariants(media.variants) : null;
  if (!v || !media) return null;
  const urls = buildPhotoUrls(v, media.fileRef);
  return urls.gallery_512 ?? urls.view_1200 ?? urls.original;
}

/** The cards, in the order of `ids` */
export async function getSessionMergeCards(ids: string[]): Promise<SessionMergeCard[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.session.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      date: true,
      datePrecision: true,
      createdAt: true,
      label: { select: { name: true } },
      project: { select: { name: true } },
      _count: { select: { mediaItems: { where: { isAnnotation: false } } } },
      setSessionLinks: {
        select: {
          set: {
            select: {
              id: true,
              title: true,
              type: true,
              releaseDate: true,
              releaseDatePrecision: true,
              channel: { select: { name: true, label: { select: { name: true } } } },
              coverMediaItem: { select: { variants: true, fileRef: true } },
            },
          },
        },
      },
      mediaItems: { where: { isAnnotation: false }, select: { variants: true, fileRef: true }, orderBy: { createdAt: "asc" }, take: 4 },
      contributions: {
        where: ON_CAMERA,
        select: { person: { select: { id: true, icgId: true, aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } } } },
      },
    },
  });
  const byId = new Map(
    rows.map((s) => {
      const sets = s.setSessionLinks
        .map(({ set }) => set)
        .sort((a, b) => (a.releaseDate?.getTime() ?? Infinity) - (b.releaseDate?.getTime() ?? Infinity));
      const people = new Map<string, string>();
      for (const { person } of s.contributions) {
        people.set(person.id, getDisplayName(person.aliases[0]?.name ?? null, person.icgId));
      }
      const card: SessionMergeCard = {
        id: s.id,
        name: s.name,
        date: s.date,
        datePrecision: s.datePrecision,
        createdAt: s.createdAt,
        earliestRelease: sets.find((x) => x.releaseDate)?.releaseDate ?? null,
        labelName: s.label?.name ?? sets.find((x) => x.channel?.label)?.channel?.label?.name ?? null,
        projectName: s.project?.name ?? null,
        sets: sets.map((x) => ({
          id: x.id,
          title: x.title,
          type: x.type as "photo" | "video",
          channelName: x.channel?.name ?? null,
          releaseDate: x.releaseDate,
          releaseDatePrecision: x.releaseDatePrecision,
          coverUrl: thumb(x.coverMediaItem),
        })),
        thumbUrls: s.mediaItems.map(thumb).filter((u): u is string => !!u),
        people: [...people].map(([id, name]) => ({ id, name })),
        mediaCount: s._count.mediaItems,
      };
      return [s.id, card];
    }),
  );
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
}

/**
 * Sessions to merge `sessionId` with. Without a query: the ones that share people
 * on camera, a label or the project, best first. With a query: sessions whose
 * name, set titles, people (name or ICG-ID) or label match — ranked the same way.
 */
export async function getSessionMergeCandidates(
  sessionId: string,
  query?: string,
): Promise<{ self: SessionMergeCard | null; candidates: SessionMergeCandidate[] }> {
  const selfFacts = (await loadFacts([sessionId])).get(sessionId);
  const [self] = await getSessionMergeCards([sessionId]);
  if (!selfFacts || !self) return { self: null, candidates: [] };

  const base = { type: "PRODUCTION" as const, id: { not: sessionId } };
  const q = query?.trim();
  let poolIds: string[];
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    const found = await prisma.session.findMany({
      where: {
        ...base,
        OR: [
          { name: contains },
          { label: { name: contains } },
          { setSessionLinks: { some: { set: { OR: [{ title: contains }, { channel: { name: contains } }, { channel: { label: { name: contains } } }] } } } },
          { contributions: { some: { person: { OR: [{ icgId: contains }, { aliases: { some: { name: contains } } }] } } } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_POOL,
    });
    poolIds = found.map((s) => s.id);
  } else {
    const labelIds = [...selfFacts.labels.keys()];
    const personIds = [...selfFacts.personIds];
    const [byPeople, byLabelOrProject] = await Promise.all([
      personIds.length
        ? prisma.sessionContribution.findMany({
            where: { personId: { in: personIds }, ...ON_CAMERA, session: base },
            select: { sessionId: true },
            distinct: ["sessionId"],
          })
        : [],
      labelIds.length || selfFacts.project
        ? prisma.session.findMany({
            where: {
              ...base,
              OR: [
                ...(labelIds.length
                  ? [{ labelId: { in: labelIds } }, { setSessionLinks: { some: { set: { channel: { labelId: { in: labelIds } } } } } }]
                  : []),
                ...(selfFacts.project ? [{ projectId: selfFacts.project.id }] : []),
              ],
            },
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: MAX_POOL,
          })
        : [],
    ]);
    poolIds = [...new Set([...byPeople.map((c) => c.sessionId), ...byLabelOrProject.map((s) => s.id)])];
  }

  const facts = await loadFacts(poolIds);
  const scored = poolIds
    .flatMap((id) => {
      const f = facts.get(id);
      return f ? [{ id, ...score(selfFacts, f) }] : [];
    })
    .filter((s) => q || s.score > 0)
    .sort((a, b) => b.score - a.score || (a.days ?? Infinity) - (b.days ?? Infinity))
    .slice(0, q ? MAX_SEARCHED : MAX_SUGGESTED);

  const cards = new Map((await getSessionMergeCards(scored.map((s) => s.id))).map((c) => [c.id, c]));
  const candidates = scored.flatMap((s) => {
    const card = cards.get(s.id);
    if (!card) return [];
    const reasons: SessionMergeReason[] = [];
    const names = card.people.filter((p) => s.sharedPeople.includes(p.id)).map((p) => p.name);
    if (names.length) reasons.push({ kind: "people", names });
    if (s.labelName) reasons.push({ kind: "label", name: s.labelName });
    if (s.projectName) reasons.push({ kind: "project", name: s.projectName });
    if (s.days !== null) reasons.push({ kind: "close", days: s.days });
    return [{ ...card, score: s.score, reasons }];
  });
  return { self, candidates };
}

/** The older of two sessions survives — see resolveMergeDirection */
export async function getSessionMergeDirection(aId: string, bId: string): Promise<MergeDirection> {
  const [a, b] = await getSessionMergeCards([aId, bId]);
  if (!a || !b) throw new Error("Session not found");
  return resolveMergeDirection(a, b);
}

/**
 * What the compare page needs of a photo — the manager-only fields stay behind
 * (RSC payload), and the set count too: the page already groups by set.
 */
function forCompare({ links: _links, collectionIds: _collections, setCount: _setCount, ...rest }: GalleryItem): GalleryItem {
  return rest;
}

/**
 * The compare page (2026-10-20): both sessions with all their photos, the older
 * one as `survivor` whatever the order asked. Null unless both are distinct
 * production sessions.
 */
export async function getSessionMergeComparison(aId: string, bId: string): Promise<SessionMergeComparison | null> {
  if (!aId || !bId || aId === bId) return null;
  const production = await prisma.session.count({ where: { id: { in: [aId, bId] }, type: "PRODUCTION" } });
  if (production !== 2) return null;
  const [cards, photosA, photosB] = await Promise.all([
    getSessionMergeCards([aId, bId]),
    getSessionMediaGallery(aId),
    getSessionMediaGallery(bId),
  ]);
  const [a, b] = cards;
  if (!a || !b) return null;
  const direction = resolveMergeDirection(a, b);
  const sides = { [aId]: { card: a, photos: photosA.map(forCompare) }, [bId]: { card: b, photos: photosB.map(forCompare) } };
  const absorbedPeople = new Set(sides[direction.absorbedId].card.people.map((p) => p.id));
  return {
    survivor: sides[direction.survivorId],
    absorbed: sides[direction.absorbedId],
    reason: direction.reason,
    sharedPersonIds: sides[direction.survivorId].card.people.filter((p) => absorbedPeople.has(p.id)).map((p) => p.id),
  };
}
