import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import type { TrailEntityType } from "@/lib/browse-trail";

/**
 * Quick jump (⌘K, 2026-11-13): a few hits per kind of detail page for a typed
 * query — people by ICG-ID or any alias, sets, sessions, channels, labels,
 * artists, projects, collections and contacts by name.
 */

export type QuickJumpHit = {
  type: TrailEntityType;
  id: string;
  /** People as `Name (ICG-ID)` */
  name: string;
  /** A second line: an alias that matched, a set's channel and year … */
  detail: string | null;
};

const PER_KIND = 5;

function year(d: Date | null): string | null {
  return d ? String(d.getUTCFullYear()) : null;
}

/** Exact and prefix matches before the rest, then the order the query gave */
function rank<T>(rows: T[], key: (r: T) => string[], q: string): T[] {
  const ql = q.toLowerCase();
  const score = (r: T) => {
    const keys = key(r).map((k) => k.toLowerCase());
    if (keys.some((k) => k === ql)) return 0;
    if (keys.some((k) => k.startsWith(ql))) return 1;
    return 2;
  };
  return rows
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.r);
}

export async function quickJump(rawQuery: string): Promise<QuickJumpHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const norm = normalizeForSearch(q);
  const take = PER_KIND * 3; // ranked, then cut to PER_KIND

  const [people, sets, sessions, channels, labels, artists, projects, collections, contacts] = await Promise.all([
    prisma.person.findMany({
      where: { OR: [{ icgId: has }, { aliases: { some: { name: has } } }] },
      select: {
        id: true,
        icgId: true,
        aliases: { where: { OR: [{ isCommon: true }, { name: has }] }, select: { name: true, isCommon: true } },
      },
      take,
    }),
    prisma.set.findMany({
      where: { title: has },
      select: { id: true, title: true, releaseDate: true, channel: { select: { name: true } } },
      orderBy: { releaseDate: { sort: "desc", nulls: "last" } },
      take,
    }),
    prisma.session.findMany({
      where: { name: has, type: { not: "REFERENCE" } },
      select: { id: true, name: true, date: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.channel.findMany({
      where: { OR: [{ name: has }, { shortName: has }] },
      select: { id: true, name: true, shortName: true, label: { select: { name: true } } },
      orderBy: { name: "asc" },
      take,
    }),
    prisma.label.findMany({ where: { name: has }, select: { id: true, name: true }, orderBy: { name: "asc" }, take }),
    prisma.artist.findMany({
      where: { nameNorm: { contains: norm, mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take,
    }),
    prisma.project.findMany({ where: { name: has }, select: { id: true, name: true }, orderBy: { name: "asc" }, take }),
    prisma.mediaCollection.findMany({ where: { name: has }, select: { id: true, name: true }, orderBy: { name: "asc" }, take }),
    prisma.contact.findMany({
      where: { ignoredAt: null, OR: [{ icgId: has }, { name: has }] },
      select: { id: true, name: true, icgId: true },
      orderBy: { name: "asc" },
      take,
    }),
  ]);

  const hits: QuickJumpHit[] = [];
  const push = <T>(rows: T[], keys: (r: T) => string[], map: (r: T) => QuickJumpHit) => {
    for (const r of rank(rows, keys, q).slice(0, PER_KIND)) hits.push(map(r));
  };

  push(
    people,
    (p) => [p.icgId, ...p.aliases.map((a) => a.name)],
    (p) => {
      const common = p.aliases.find((a) => a.isCommon)?.name;
      const ql = q.toLowerCase();
      const other = p.aliases.find((a) => !a.isCommon && a.name.toLowerCase().includes(ql));
      const commonMatches = common?.toLowerCase().includes(ql) || p.icgId.toLowerCase().includes(ql);
      return {
        type: "person",
        id: p.id,
        name: common ? `${common} (${p.icgId})` : p.icgId,
        detail: !commonMatches && other ? `a.k.a. ${other.name}` : null,
      };
    },
  );
  push(sets, (s) => [s.title], (s) => ({
    type: "set",
    id: s.id,
    name: s.title,
    detail: [s.channel?.name, year(s.releaseDate)].filter(Boolean).join(" · ") || null,
  }));
  push(sessions, (s) => [s.name], (s) => ({ type: "session", id: s.id, name: s.name, detail: year(s.date) }));
  push(channels, (c) => [c.name, c.shortName ?? ""], (c) => ({ type: "channel", id: c.id, name: c.name, detail: c.label?.name ?? null }));
  push(labels, (l) => [l.name], (l) => ({ type: "label", id: l.id, name: l.name, detail: null }));
  push(artists, (a) => [a.name], (a) => ({ type: "artist", id: a.id, name: a.name, detail: null }));
  push(projects, (p) => [p.name], (p) => ({ type: "project", id: p.id, name: p.name, detail: null }));
  push(collections, (c) => [c.name], (c) => ({ type: "collection", id: c.id, name: c.name, detail: null }));
  push(contacts, (c) => [c.name, c.icgId ?? ""], (c) => ({
    type: "contact",
    id: c.id,
    name: c.icgId ? `${c.name} (${c.icgId})` : c.name,
    detail: "Contact — not yet developed",
  }));
  return hits;
}
