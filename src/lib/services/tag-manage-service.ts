import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { domainsForEntity, type TaggableEntity } from "@/lib/tag-domains";
import { deleteTagDefinition, updateTagDefinition } from "./tag-service";

// Managing the catalogue from /tags (2026-10-10): moving tags between groups and
// acting on several tags at once. A move is checked before it is made — the
// check reports what stands in the way, with numbers, and never resolves a
// conflict by guessing (the same rule as for disk markers, ADR-0034).

const JOIN: Record<TaggableEntity, { table: string; column: string; noun: string }> = {
  PERSON: { table: "person_tag", column: "personId", noun: "people" },
  SESSION: { table: "session_tag", column: "sessionId", noun: "sessions" },
  SET: { table: "set_tag", column: "setId", noun: "sets" },
  MEDIA_ITEM: { table: "media_item_tag", column: "mediaItemId", noun: "images" },
  PROJECT: { table: "project_tag", column: "projectId", noun: "projects" },
  ARCHIVE_FOLDER: { table: "archive_folder_tag", column: "archiveFolderId", noun: "archive folders" },
};
const ENTITIES = Object.keys(JOIN) as TaggableEntity[];

export type TagMoveConflict =
  /** Items of a kind the target group's domain does not admit */
  | { kind: "domain"; entity: TaggableEntity; noun: string; count: number }
  /** Items that would carry two tags of the (exclusive) target group */
  | { kind: "exclusive"; entity: TaggableEntity; noun: string; count: number }
  /** A tag of that name already lives in the target group — merge instead */
  | { kind: "name"; tagId: string; existingId: string; name: string };

export type TagMoveCheck = {
  /** The tags that would move: the chosen ones, plus their sub-tags when asked */
  tagIds: string[];
  conflicts: TagMoveConflict[];
};

/** Sub-tags (any depth) that sit in the same group as their ancestor */
async function sameGroupDescendants(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE d AS (
      SELECT t.id, t."groupId" FROM tag_definition t WHERE t.id IN (${Prisma.join(tagIds)})
      UNION
      SELECT c.id, c."groupId" FROM tag_definition c JOIN d ON c."parentId" = d.id AND c."groupId" = d."groupId"
    )
    SELECT id FROM d`);
  return rows.map((r) => r.id);
}

/** What stands in the way of moving `tagIds` into `groupId` — nothing is written */
export async function checkTagMove(
  tagIds: string[],
  groupId: string,
  { withSubTags = true }: { withSubTags?: boolean } = {},
): Promise<TagMoveCheck> {
  const target = await prisma.tagGroup.findUniqueOrThrow({ where: { id: groupId }, select: { domain: true, isExclusive: true } });
  const moving = withSubTags ? await sameGroupDescendants(tagIds) : [...new Set(tagIds)];
  const ids = Prisma.join(moving);
  const conflicts: TagMoveConflict[] = [];

  for (const entity of ENTITIES) {
    const j = JOIN[entity];
    const table = Prisma.raw(`"${j.table}"`);
    const col = Prisma.raw(`"${j.column}"`);
    if (!domainsForEntity(entity).includes(target.domain)) {
      const [{ n }] = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(DISTINCT x.${col})::bigint AS n FROM ${table} x WHERE x."tagDefinitionId" IN (${ids})`);
      if (n > BigInt(0)) conflicts.push({ kind: "domain", entity, noun: j.noun, count: Number(n) });
      continue;
    }
    if (target.isExclusive) {
      // An item that would end up with two tags of the group: one it already has
      // there, or two of the moving tags
      const [{ n }] = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS n FROM (
          SELECT x.${col} AS e FROM ${table} x
          LEFT JOIN tag_definition d ON d.id = x."tagDefinitionId"
          WHERE x."tagDefinitionId" IN (${ids}) OR (d."groupId" = ${groupId} AND x."tagDefinitionId" NOT IN (${ids}))
          GROUP BY x.${col}
          HAVING count(*) > 1 AND bool_or(x."tagDefinitionId" IN (${ids}))
        ) c`);
      if (n > BigInt(0)) conflicts.push({ kind: "exclusive", entity, noun: j.noun, count: Number(n) });
    }
  }

  const movingTags = await prisma.tagDefinition.findMany({ where: { id: { in: moving } }, select: { id: true, slug: true, name: true, groupId: true } });
  const toMove = movingTags.filter((t) => t.groupId !== groupId);
  if (toMove.length) {
    const clashes = await prisma.tagDefinition.findMany({
      where: { groupId, slug: { in: toMove.map((t) => t.slug) }, id: { notIn: moving } },
      select: { id: true, slug: true },
    });
    for (const c of clashes) {
      const t = toMove.find((m) => m.slug === c.slug)!;
      conflicts.push({ kind: "name", tagId: t.id, existingId: c.id, name: t.name });
    }
  }
  return { tagIds: moving, conflicts };
}

export type TagMoveResult = { moved: number } | { moved: 0; conflicts: TagMoveConflict[] };

/**
 * Move tags (and by default their same-group sub-tags) into another group.
 * Refused, with the conflicts, when anything stands in the way. Parent links stay
 * as they are — a parent in another group is allowed and keeps filtering by it.
 */
export async function moveTagsToGroup(
  tagIds: string[],
  groupId: string,
  opts: { withSubTags?: boolean } = {},
): Promise<TagMoveResult> {
  const check = await checkTagMove(tagIds, groupId, opts);
  if (check.conflicts.length) return { moved: 0, conflicts: check.conflicts };
  return prisma.$transaction(async (tx) => {
    const max = await tx.tagDefinition.aggregate({ where: { groupId }, _max: { sortOrder: true } });
    let order = (max._max.sortOrder ?? -1) + 1;
    const tags = await tx.tagDefinition.findMany({
      where: { id: { in: check.tagIds }, groupId: { not: groupId } },
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true },
    });
    for (const t of tags) {
      await tx.tagDefinition.update({ where: { id: t.id }, data: { groupId, sortOrder: order++ } });
    }
    return { moved: tags.length };
  });
}

/** Make each of `tagIds` a sub-tag of `parentId` (null: top level); cycles are refused */
export async function setTagsParent(tagIds: string[], parentId: string | null): Promise<number> {
  let n = 0;
  for (const id of tagIds) {
    if (id === parentId) continue;
    await updateTagDefinition(id, { parentId });
    n++;
  }
  return n;
}

/** Delete several tags; each one's sub-tags move up to its parent */
export async function deleteTags(tagIds: string[]): Promise<number> {
  for (const id of tagIds) await deleteTagDefinition(id);
  return tagIds.length;
}
