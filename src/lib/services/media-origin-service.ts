import { prisma } from "@/lib/db";
import type { MediaItemOrigin } from "@/lib/types";
import { getDisplayName } from "@/lib/utils";
import { getHiddenPersonsForMedia, getOnCameraCastForSessions } from "./appearance-service";

const PERSON_NAME_SELECT = {
  id: true,
  icgId: true,
  aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
} as const;

function personName(p: { icgId: string; aliases: { name: string }[] }): string {
  return getDisplayName(p.aliases[0]?.name ?? null, p.icgId);
}

/**
 * Where an image comes from: its sets, its session and the people shown in it.
 * A copy without sets of its own (a reference-session copy) points back through
 * its source image. Null when the image does not exist.
 */
export async function getMediaItemOrigin(mediaItemId: string): Promise<MediaItemOrigin | null> {
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    select: {
      id: true,
      copiedFromMediaItemId: true,
      session: {
        select: {
          id: true,
          name: true,
          type: true,
          person: { select: PERSON_NAME_SELECT },
        },
      },
    },
  });
  if (!item) return null;

  // The image whose sets and cast tell the story — the source, for a copy
  let originId = item.id;
  let originSessionId = item.session.id;
  const ownSets = await prisma.setMediaItem.count({ where: { mediaItemId: item.id } });
  if (ownSets === 0 && item.copiedFromMediaItemId) {
    const source = await prisma.mediaItem.findUnique({
      where: { id: item.copiedFromMediaItemId },
      select: { id: true, sessionId: true },
    });
    if (source) {
      originId = source.id;
      originSessionId = source.sessionId;
    }
  }

  const [setLinks, castBySession, hiddenByMedia] = await Promise.all([
    prisma.setMediaItem.findMany({
      where: { mediaItemId: originId },
      select: { set: { select: { id: true, title: true, type: true } } },
      orderBy: { set: { releaseDate: { sort: "asc", nulls: "last" } } },
    }),
    getOnCameraCastForSessions([originSessionId]),
    getHiddenPersonsForMedia([originId]),
  ]);

  const hidden = new Set(hiddenByMedia.get(originId) ?? []);
  const shownIds = (castBySession.get(originSessionId) ?? []).filter((id) => !hidden.has(id));
  const persons = shownIds.length
    ? await prisma.person.findMany({ where: { id: { in: shownIds } }, select: PERSON_NAME_SELECT })
    : [];
  const byId = new Map(persons.map((p) => [p.id, p]));

  const refPerson = item.session.person;
  return {
    imageId: originId,
    sets: setLinks.map(({ set }) => ({ id: set.id, title: set.title, type: set.type as "photo" | "video" })),
    session: { id: item.session.id, name: item.session.name, type: item.session.type },
    referencePerson: refPerson ? { id: refPerson.id, name: personName(refPerson) } : null,
    people: shownIds.flatMap((id) => {
      const p = byId.get(id);
      return p ? [{ id: p.id, name: personName(p) }] : [];
    }),
  };
}
