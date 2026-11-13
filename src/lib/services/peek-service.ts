import { prisma } from "@/lib/db";
import { getCoverPhotosForSets, getHeadshotsForPersons } from "@/lib/services/media-service";

/**
 * Peek (2026-11-13): the short card a side panel shows for a person or a set,
 * so a list can be looked through without leaving it.
 */

export type PeekImage = { url: string; focalX: number | null; focalY: number | null };

export type PersonPeek = {
  type: "person";
  id: string;
  /** `Name (ICG-ID)` */
  name: string;
  image: PeekImage | null;
  facts: string[];
  rating: number | null;
  setCount: number;
  /** Her newest sets, with covers */
  sets: { id: string; title: string; detail: string | null; cover: PeekImage | null }[];
};

export type SetPeek = {
  type: "set";
  id: string;
  name: string;
  image: PeekImage | null;
  facts: string[];
  rating: number | null;
  cast: { id: string; name: string; image: PeekImage | null }[];
};

export type Peek = PersonPeek | SetPeek;

const NEWEST = 6;

function yearOf(d: Date | null): string | null {
  return d ? String(d.getUTCFullYear()) : null;
}

function ageOn(birth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function personName(p: { icgId: string; aliases: { name: string }[] }): string {
  const common = p.aliases[0]?.name;
  return common ? `${common} (${p.icgId})` : p.icgId;
}

export async function getPersonPeek(id: string): Promise<PersonPeek | null> {
  const p = await prisma.person.findUnique({
    where: { id },
    select: {
      id: true,
      icgId: true,
      nationality: true,
      birthdate: true,
      status: true,
      rating: true,
      activeFrom: true,
      retiredAt: true,
      aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
      _count: { select: { setParticipants: true } },
    },
  });
  if (!p) return null;

  const links = await prisma.setParticipant.findMany({
    where: { personId: id },
    select: { set: { select: { id: true, title: true, releaseDate: true, channel: { select: { name: true } } } } },
    orderBy: { set: { releaseDate: { sort: "desc", nulls: "last" } } },
    distinct: ["setId"],
    take: NEWEST,
  });
  const sets = links.map((l) => l.set);
  const [headshots, covers] = await Promise.all([getHeadshotsForPersons([id]), getCoverPhotosForSets(sets.map((s) => s.id))]);
  const head = headshots.get(id);

  const span = [yearOf(p.activeFrom), yearOf(p.retiredAt)].filter(Boolean);
  const facts = [
    p.nationality,
    p.birthdate ? `${ageOn(p.birthdate)} yrs` : null,
    p.status === "active" ? "Active" : p.status.charAt(0).toUpperCase() + p.status.slice(1),
    span.length ? `${span[0]}${span[1] ? `–${span[1]}` : "–"}` : null,
  ].filter((x): x is string => Boolean(x));

  return {
    type: "person",
    id: p.id,
    name: personName(p),
    image: head ? { url: head.url, focalX: head.focalX, focalY: head.focalY } : null,
    facts,
    rating: p.rating,
    setCount: p._count.setParticipants,
    sets: sets.map((s) => ({
      id: s.id,
      title: s.title,
      detail: [s.channel?.name, yearOf(s.releaseDate)].filter(Boolean).join(" · ") || null,
      cover: covers.get(s.id) ?? null,
    })),
  };
}

export async function getSetPeek(id: string): Promise<SetPeek | null> {
  const s = await prisma.set.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      releaseDate: true,
      imageCount: true,
      rating: true,
      channel: { select: { name: true } },
      participants: {
        select: { person: { select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } } } },
      },
    },
  });
  if (!s) return null;

  const people = [...new Map(s.participants.map((x) => [x.person.id, x.person])).values()];
  const [covers, headshots] = await Promise.all([getCoverPhotosForSets([id]), getHeadshotsForPersons(people.map((x) => x.id))]);
  const cover = covers.get(id);
  const date = s.releaseDate ? s.releaseDate.toISOString().slice(0, 10) : null;

  return {
    type: "set",
    id: s.id,
    name: s.title,
    image: cover ?? null,
    facts: [
      s.channel?.name ?? null,
      date,
      s.type === "video" ? "Video" : "Photo set",
      s.imageCount ? `${s.imageCount} images` : null,
    ].filter((x): x is string => Boolean(x)),
    rating: s.rating,
    cast: people.map((x) => {
      const h = headshots.get(x.id);
      return { id: x.id, name: personName(x), image: h ? { url: h.url, focalX: h.focalX, focalY: h.focalY } : null };
    }),
  };
}
