import { prisma } from "@/lib/db";
import {
  resolveEffectiveTags,
  type EffectiveTag,
  type InheritedTags,
  type TagFact,
} from "@/lib/effective-tags";
import type { TaggableEntity } from "./entity-tag-service";

// Loads the facts `resolveEffectiveTags` folds (ADR-0033). Inheritance flows
// down the content chain only:
//   Set   ← each of its sessions (SetSession)
//   Image ← its own session, and each set that contains it (SetMediaItem)
// A set's *other* sessions are not the image's production, so an image does
// not inherit through the set from them. Persons and projects have no chain.

const FACT_SELECT = {
  select: {
    tagDefinition: {
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
        group: {
          select: { id: true, name: true, color: true, isExclusive: true, kind: true, sortOrder: true },
        },
      },
    },
  },
} as const;

type FactRow = { tagDefinition: TagFact };
const facts = (rows: FactRow[]): TagFact[] => rows.map((r) => r.tagDefinition);

export async function getEffectiveTags(entityType: TaggableEntity, entityId: string): Promise<EffectiveTag[]> {
  switch (entityType) {
    case "PERSON": {
      const rows = await prisma.personTag.findMany({ where: { personId: entityId }, ...FACT_SELECT });
      return resolveEffectiveTags(facts(rows), []);
    }
    case "ARCHIVE_FOLDER": {
      // A folder has no content chain above it — own tags only (ADR-0034)
      const rows = await prisma.archiveFolderTag.findMany({ where: { archiveFolderId: entityId }, ...FACT_SELECT });
      return resolveEffectiveTags(facts(rows), []);
    }
    case "PROJECT": {
      const rows = await prisma.projectTag.findMany({ where: { projectId: entityId }, ...FACT_SELECT });
      return resolveEffectiveTags(facts(rows), []);
    }
    case "SESSION": {
      const rows = await prisma.sessionTag.findMany({ where: { sessionId: entityId }, ...FACT_SELECT });
      return resolveEffectiveTags(facts(rows), []);
    }
    case "SET": {
      const [direct, sessions] = await Promise.all([
        prisma.setTag.findMany({ where: { setId: entityId }, ...FACT_SELECT }),
        prisma.setSession.findMany({
          where: { setId: entityId },
          select: {
            session: { select: { id: true, name: true, sessionTags: FACT_SELECT } },
          },
        }),
      ]);
      const inherited: InheritedTags[] = sessions.map(({ session }) => ({
        origin: { level: "SESSION", id: session.id, label: session.name },
        tags: facts(session.sessionTags),
      }));
      return resolveEffectiveTags(facts(direct), inherited);
    }
    case "MEDIA_ITEM": {
      const item = await prisma.mediaItem.findUnique({
        where: { id: entityId },
        select: {
          mediaItemTags: FACT_SELECT,
          session: { select: { id: true, name: true, sessionTags: FACT_SELECT } },
          setMediaItems: {
            select: { set: { select: { id: true, title: true, setTags: FACT_SELECT } } },
          },
        },
      });
      if (!item) return [];
      const inherited: InheritedTags[] = [
        { origin: { level: "SESSION", id: item.session.id, label: item.session.name }, tags: facts(item.session.sessionTags) },
        ...item.setMediaItems.map(({ set }) => ({
          origin: { level: "SET" as const, id: set.id, label: set.title },
          tags: facts(set.setTags),
        })),
      ];
      return resolveEffectiveTags(facts(item.mediaItemTags), inherited);
    }
  }
}

/**
 * Direct tags of many folders or sets at once, for list rows (ADR-0034) — the
 * archive list shows each folder's tag owner without a request per row.
 */
export async function getDirectTagsBatch(
  entityType: "ARCHIVE_FOLDER" | "SET",
  ids: string[],
): Promise<Map<string, EffectiveTag[]>> {
  const out = new Map<string, EffectiveTag[]>();
  if (ids.length === 0) return out;
  const grouped = new Map<string, TagFact[]>();
  const push = (id: string, fact: TagFact) => grouped.set(id, [...(grouped.get(id) ?? []), fact]);
  if (entityType === "ARCHIVE_FOLDER") {
    const rows = await prisma.archiveFolderTag.findMany({
      where: { archiveFolderId: { in: ids } },
      select: { archiveFolderId: true, ...FACT_SELECT.select },
    });
    for (const r of rows) push(r.archiveFolderId, r.tagDefinition);
  } else {
    const rows = await prisma.setTag.findMany({
      where: { setId: { in: ids } },
      select: { setId: true, ...FACT_SELECT.select },
    });
    for (const r of rows) push(r.setId, r.tagDefinition);
  }
  for (const [id, list] of grouped) out.set(id, resolveEffectiveTags(list, []));
  return out;
}
