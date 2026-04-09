import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";

export async function getArtists(search?: string) {
  const where = search
    ? { nameNorm: { contains: normalizeForSearch(search), mode: "insensitive" as const } }
    : {};

  return prisma.artist.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { creditsRaw: { where: { resolutionStatus: "RESOLVED" } } } },
    },
  });
}

export async function getArtistById(id: string) {
  return prisma.artist.findUnique({ where: { id } });
}

export type ArtistStats = {
  setCount: number;
  channelCount: number;
  imageCount: number;
  videoCount: number;
};

export async function getArtistStats(id: string): Promise<ArtistStats> {
  const credits = await prisma.setCreditRaw.findMany({
    where: { resolvedArtistId: id, resolutionStatus: "RESOLVED" },
    include: {
      set: {
        select: {
          id: true,
          channelId: true,
          type: true,
          imageCount: true,
        },
      },
    },
  });

  const setIds = new Set<string>();
  const channelIds = new Set<string>();
  let imageCount = 0;
  let videoCount = 0;

  for (const credit of credits) {
    if (setIds.has(credit.set.id)) continue;
    setIds.add(credit.set.id);
    if (credit.set.channelId) channelIds.add(credit.set.channelId);
    if (credit.set.type === "video") {
      videoCount++;
    } else {
      imageCount += credit.set.imageCount ?? 0;
    }
  }

  return {
    setCount: setIds.size,
    channelCount: channelIds.size,
    imageCount,
    videoCount,
  };
}

export type ArtistCareerEntry = {
  setId: string;
  title: string;
  releaseDate: Date | null;
  type: string;
  imageCount: number | null;
  channelId: string | null;
  channelName: string | null;
  participants: Array<{ personId: string; name: string }>;
};

export type ArtistCareerGroup = {
  channelId: string | null;
  channelName: string;
  sets: ArtistCareerEntry[];
};

export async function getArtistCareer(id: string): Promise<ArtistCareerGroup[]> {
  const credits = await prisma.setCreditRaw.findMany({
    where: { resolvedArtistId: id, resolutionStatus: "RESOLVED" },
    include: {
      set: {
        select: {
          id: true,
          title: true,
          releaseDate: true,
          type: true,
          imageCount: true,
          channelId: true,
          channel: { select: { name: true } },
          participants: {
            select: {
              person: {
                select: {
                  id: true,
                  aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  // Deduplicate sets and group by channel
  const seenSets = new Set<string>();
  const groupMap = new Map<string | null, ArtistCareerEntry[]>();

  for (const credit of credits) {
    const s = credit.set;
    if (seenSets.has(s.id)) continue;
    seenSets.add(s.id);

    const entry: ArtistCareerEntry = {
      setId: s.id,
      title: s.title,
      releaseDate: s.releaseDate,
      type: s.type,
      imageCount: s.imageCount,
      channelId: s.channelId,
      channelName: s.channel?.name ?? "Unknown",
      participants: s.participants.map((p) => ({
        personId: p.person.id,
        name: p.person.aliases[0]?.name ?? "Unknown",
      })),
    };

    const key = s.channelId;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(entry);
  }

  // Sort sets within each group by date desc
  const groups: ArtistCareerGroup[] = [];
  for (const [channelId, sets] of groupMap) {
    sets.sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return 0;
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return b.releaseDate.getTime() - a.releaseDate.getTime();
    });
    groups.push({
      channelId,
      channelName: sets[0].channelName ?? "Unknown",
      sets,
    });
  }

  // Sort groups by set count desc
  groups.sort((a, b) => b.sets.length - a.sets.length);

  return groups;
}

export async function createArtist(data: {
  name: string;
  nationality?: string;
  bio?: string;
}) {
  return prisma.artist.create({
    data: {
      name: data.name,
      nameNorm: normalizeForSearch(data.name),
      nationality: data.nationality || null,
      bio: data.bio || null,
    },
  });
}

export async function updateArtist(
  id: string,
  data: { name?: string; nationality?: string | null; bio?: string | null },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.nameNorm = normalizeForSearch(data.name);
  }
  if (data.nationality !== undefined) updateData.nationality = data.nationality || null;
  if (data.bio !== undefined) updateData.bio = data.bio || null;

  return prisma.artist.update({ where: { id }, data: updateData });
}

export async function deleteArtist(id: string) {
  return prisma.$transaction(async (tx) => {
    // Unresolve all credits pointing to this artist
    await tx.setCreditRaw.updateMany({
      where: { resolvedArtistId: id },
      data: { resolvedArtistId: null, resolutionStatus: "UNRESOLVED" },
    });

    return tx.artist.delete({ where: { id } });
  });
}

export async function searchArtists(query: string) {
  if (!query.trim()) return [];

  return prisma.artist.findMany({
    where: { nameNorm: { contains: normalizeForSearch(query), mode: "insensitive" } },
    select: { id: true, name: true, nationality: true },
    take: 10,
    orderBy: { name: "asc" },
  });
}
