import { prisma } from "@/lib/db";
import type { GalleryItem } from "@/lib/types";
import { resolveTerm, type ResolvedTagQuery, type TagSourceFilter } from "@/lib/tag-query";
import type { TaggableEntity } from "@/lib/tag-domains";
import { getMediaGalleryItemsByIds } from "./media-service";
import { findTagMatchIds, loadTagCatalog } from "./tag-filter-service";
import { getTagUsageBreakdown, type TagDefinitionWithGroup } from "./tag-service";

// The tag browser (ADR-0033, S7): /tags (catalogue tree + workflow To-do) and
// /tags/[id] (what carries a tag — own and inherited, sub-tags included).

// ─── Catalogue tree ──────────────────────────────────────────────────────────

export type TagCounts = { person: number; session: number; set: number; media: number; project: number };

export type TagTreeTag = TagDefinitionWithGroup & { counts: TagCounts };

export type TagTreeGroup = {
  id: string;
  name: string;
  slug: string;
  color: string;
  isExclusive: boolean;
  domain: TagDefinitionWithGroup["group"]["domain"];
  typicalLevel: TagDefinitionWithGroup["group"]["typicalLevel"];
  kind: TagDefinitionWithGroup["group"]["kind"];
  tags: TagTreeTag[];
};

const ZERO: TagCounts = { person: 0, session: 0, set: 0, media: 0, project: 0 };

export async function getTagTree(): Promise<TagTreeGroup[]> {
  const [groups, usage] = await Promise.all([
    prisma.tagGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tags: { orderBy: { sortOrder: "asc" }, include: { aliases: { select: { name: true } } } },
      },
    }),
    getTagUsageBreakdown(),
  ]);
  const counts = new Map(usage.map((u) => [u.id, { person: u.person, session: u.session, set: u.set, media: u.media, project: u.project }]));
  return groups.map((g) => {
    const group = {
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      isExclusive: g.isExclusive,
      domain: g.domain,
      typicalLevel: g.typicalLevel,
      kind: g.kind,
    };
    return {
      ...group,
      tags: g.tags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        parentId: t.parentId,
        typicalLevel: t.typicalLevel,
        sortOrder: t.sortOrder,
        group,
        aliases: t.aliases,
        counts: counts.get(t.id) ?? ZERO,
      })),
    };
  });
}

// ─── Tag detail ──────────────────────────────────────────────────────────────

export async function getTagDetail(id: string) {
  return prisma.tagDefinition.findUnique({
    where: { id },
    include: {
      group: true,
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      aliases: { select: { id: true, name: true } },
    },
  });
}

/** "This tag and its sub-tags" as a filter query, at one level */
async function carriersQuery(tagId: string, source: TagSourceFilter): Promise<ResolvedTagQuery | null> {
  const catalog = await loadTagCatalog();
  const tag = catalog.find((t) => t.id === tagId);
  if (!tag) return null;
  const term = resolveTerm({ group: tag.groupSlug, tag: tag.slug, exact: false, source }, catalog);
  return { all: [{ any: [term] }], none: [], unknown: [] };
}

const LIST_CAP = 200;
const IMAGE_CAP = 500;

export type CarrierRow = { id: string; label: string; sublabel: string | null; href: string; own: boolean };

async function ownIds(entity: TaggableEntity, tagId: string, ownSource: TagSourceFilter): Promise<Set<string>> {
  const q = await carriersQuery(tagId, ownSource);
  return new Set(q ? await findTagMatchIds(entity, q) : []);
}

/** People, sessions, sets carrying the tag (or a sub-tag); sets include inherited ones, flagged */
export async function getTagCarriers(tagId: string): Promise<{
  people: CarrierRow[];
  sessions: CarrierRow[];
  sets: CarrierRow[];
  totals: { people: number; sessions: number; sets: number };
}> {
  const any = await carriersQuery(tagId, "any");
  if (!any) return { people: [], sessions: [], sets: [], totals: { people: 0, sessions: 0, sets: 0 } };
  const [personIds, sessionIds, setIds, ownSetIds] = await Promise.all([
    findTagMatchIds("PERSON", any),
    findTagMatchIds("SESSION", any),
    findTagMatchIds("SET", any),
    ownIds("SET", tagId, "set"),
  ]);

  const [persons, sessions, sets] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: personIds.slice(0, LIST_CAP) } },
      select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
    }),
    prisma.session.findMany({
      where: { id: { in: sessionIds.slice(0, LIST_CAP) } },
      select: { id: true, name: true, date: true },
      orderBy: { date: "desc" },
    }),
    prisma.set.findMany({
      where: { id: { in: setIds.slice(0, LIST_CAP) } },
      select: { id: true, title: true, releaseDate: true, channel: { select: { name: true } } },
      orderBy: { releaseDate: "desc" },
    }),
  ]);

  return {
    people: persons
      .map((p) => ({
        id: p.id,
        // Always name a person with their ICG-ID
        label: `${p.aliases[0]?.name ?? p.icgId} (${p.icgId})`,
        sublabel: null,
        href: `/people/${p.id}`,
        own: true,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    sessions: sessions.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: s.date ? s.date.toISOString().slice(0, 10) : null,
      href: `/sessions/${s.id}`,
      own: true,
    })),
    sets: sets.map((s) => ({
      id: s.id,
      label: s.title,
      sublabel: [s.channel?.name, s.releaseDate?.toISOString().slice(0, 10)].filter(Boolean).join(" · ") || null,
      href: `/sets/${s.id}`,
      own: ownSetIds.has(s.id),
    })),
    totals: { people: personIds.length, sessions: sessionIds.length, sets: setIds.length },
  };
}

/** Images carrying the tag — effective (own + inherited) or own only — newest first, capped */
export async function getTagImages(tagId: string, ownOnly: boolean): Promise<{ items: GalleryItem[]; total: number }> {
  const q = await carriersQuery(tagId, ownOnly ? "image" : "any");
  if (!q) return { items: [], total: 0 };
  const ids = await findTagMatchIds("MEDIA_ITEM", q);
  if (ids.length === 0) return { items: [], total: 0 };
  const newest = await prisma.mediaItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: IMAGE_CAP,
  });
  return { items: await getMediaGalleryItemsByIds(newest.map((m) => m.id)), total: ids.length };
}

// ─── Workflow To-do ──────────────────────────────────────────────────────────

export type TodoEntry = {
  entityType: TaggableEntity;
  entityId: string;
  label: string;
  href: string;
  thumbnail: string | null;
};

export type TodoTag = { id: string; name: string; groupName: string; color: string; entries: TodoEntry[]; total: number };

const TODO_CAP = 60;

/** Open to-dos: every own assignment of a workflow tag (they never inherit) */
export async function getWorkflowTodo(): Promise<TodoTag[]> {
  const tags = await prisma.tagDefinition.findMany({
    where: { group: { kind: "WORKFLOW" } },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, group: { select: { name: true, color: true } } },
  });

  return Promise.all(
    tags.map(async (t) => {
      const where = { tagDefinitionId: t.id };
      const [persons, sessions, sets, media, projects] = await Promise.all([
        prisma.personTag.findMany({
          where,
          take: TODO_CAP,
          orderBy: { createdAt: "asc" },
          select: { person: { select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } } } },
        }),
        prisma.sessionTag.findMany({ where, take: TODO_CAP, orderBy: { createdAt: "asc" }, select: { session: { select: { id: true, name: true } } } }),
        prisma.setTag.findMany({ where, take: TODO_CAP, orderBy: { createdAt: "asc" }, select: { set: { select: { id: true, title: true } } } }),
        prisma.mediaItemTag.findMany({ where, take: TODO_CAP, orderBy: { createdAt: "asc" }, select: { mediaItemId: true } }),
        prisma.projectTag.findMany({ where, take: TODO_CAP, orderBy: { createdAt: "asc" }, select: { project: { select: { id: true, name: true } } } }),
      ]);
      const gallery = await getMediaGalleryItemsByIds(media.map((m) => m.mediaItemId));
      const counts = await Promise.all([
        prisma.personTag.count({ where }),
        prisma.sessionTag.count({ where }),
        prisma.setTag.count({ where }),
        prisma.mediaItemTag.count({ where }),
        prisma.projectTag.count({ where }),
      ]);
      const entries: TodoEntry[] = [
        ...persons.map(({ person: p }) => ({
          entityType: "PERSON" as const,
          entityId: p.id,
          label: `${p.aliases[0]?.name ?? p.icgId} (${p.icgId})`,
          href: `/people/${p.id}`,
          thumbnail: null,
        })),
        ...sessions.map(({ session: s }) => ({ entityType: "SESSION" as const, entityId: s.id, label: s.name, href: `/sessions/${s.id}`, thumbnail: null })),
        ...sets.map(({ set: s }) => ({ entityType: "SET" as const, entityId: s.id, label: s.title, href: `/sets/${s.id}`, thumbnail: null })),
        ...gallery.map((g) => ({
          entityType: "MEDIA_ITEM" as const,
          entityId: g.id,
          label: g.filename,
          href: g.sessionId ? `/sessions/${g.sessionId}` : "#",
          thumbnail: g.urls.gallery_512 ?? g.urls.original ?? null,
        })),
        ...projects.map(({ project: p }) => ({ entityType: "PROJECT" as const, entityId: p.id, label: p.name, href: `/projects/${p.id}`, thumbnail: null })),
      ];
      return {
        id: t.id,
        name: t.name,
        groupName: t.group.name,
        color: t.group.color,
        entries,
        total: counts.reduce((a, b) => a + b, 0),
      };
    }),
  );
}

export async function countOpenTodos(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT (
      (SELECT count(*) FROM person_tag x JOIN tag_definition d ON d.id = x."tagDefinitionId" JOIN tag_group g ON g.id = d."groupId" WHERE g.kind = 'WORKFLOW') +
      (SELECT count(*) FROM session_tag x JOIN tag_definition d ON d.id = x."tagDefinitionId" JOIN tag_group g ON g.id = d."groupId" WHERE g.kind = 'WORKFLOW') +
      (SELECT count(*) FROM set_tag x JOIN tag_definition d ON d.id = x."tagDefinitionId" JOIN tag_group g ON g.id = d."groupId" WHERE g.kind = 'WORKFLOW') +
      (SELECT count(*) FROM media_item_tag x JOIN tag_definition d ON d.id = x."tagDefinitionId" JOIN tag_group g ON g.id = d."groupId" WHERE g.kind = 'WORKFLOW') +
      (SELECT count(*) FROM project_tag x JOIN tag_definition d ON d.id = x."tagDefinitionId" JOIN tag_group g ON g.id = d."groupId" WHERE g.kind = 'WORKFLOW')
    )::bigint AS n
  `;
  return Number(rows[0]?.n ?? 0);
}
