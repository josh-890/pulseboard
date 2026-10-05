import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  parseTagQuery,
  PREDICATE_SUPPORT,
  resolveTerm,
  type CatalogTag,
  type QueryPredicate,
  type ResolvedPredicate,
} from "@/lib/tag-query";
import type { TaggableEntity } from "@/lib/tag-domains";
import { BEHIND_CAMERA_GROUP } from "./session-contributors";

// Non-tag conditions of the query language (ADR-0033, S5): is:fav,
// is:untagged, has:workflow, rating>=N, person:ICG-ID, persontag:tag,
// label:name, type:photo|video. Resolved against the DB once, then turned into
// SQL per entity. A predicate a browser cannot answer is reported, never
// silently dropped into a different meaning.


const NOUN: Record<TaggableEntity, string> = {
  MEDIA_ITEM: "images",
  SET: "sets",
  SESSION: "sessions",
  PERSON: "people",
  PROJECT: "projects",
  ARCHIVE_FOLDER: "archive folders",
};

const text = (p: QueryPredicate) => `${p.key}${p.op}${p.value}`;

export async function resolvePredicates(
  predicates: QueryPredicate[],
  catalog: CatalogTag[],
  entity: TaggableEntity,
): Promise<{ resolved: ResolvedPredicate[]; problems: string[] }> {
  const resolved: ResolvedPredicate[] = [];
  const problems: string[] = [];
  for (const p of predicates) {
    const value = p.value.trim();
    let r: ResolvedPredicate | null = null;
    switch (p.key) {
      case "is":
        if (["fav", "favorite", "favourite"].includes(value.toLowerCase())) r = { kind: "fav" };
        else if (value.toLowerCase() === "untagged") r = { kind: "untagged" };
        break;
      case "has":
        if (value.toLowerCase() === "workflow") r = { kind: "workflow" };
        break;
      case "rating": {
        const n = Number(value);
        const op = p.op === ":" ? "=" : p.op;
        if (Number.isInteger(n) && n >= 0 && n <= 5) r = { kind: "rating", op, value: n };
        break;
      }
      case "type":
        if (value.toLowerCase() === "photo" || value.toLowerCase() === "video") {
          r = { kind: "type", value: value.toLowerCase() as "photo" | "video" };
        }
        break;
      case "person": {
        const persons = await prisma.person.findMany({
          where: { icgId: { equals: value, mode: "insensitive" } },
          select: { id: true },
        });
        if (persons.length === 0) {
          problems.push(`No person with ICG-ID “${value}”`);
          continue;
        }
        r = { kind: "person", personIds: persons.map((x) => x.id) };
        break;
      }
      case "persontag": {
        const term = parseTagQuery(value).query.all[0]?.any[0];
        const tagIds = term ? resolveTerm(term, catalog).parts.flatMap((x) => x.tagIds) : [];
        if (tagIds.length === 0) {
          problems.push(`No tag “${value}” for persontag:`);
          continue;
        }
        r = { kind: "persontag", tagIds };
        break;
      }
      case "label": {
        const labels = await prisma.label.findMany({
          where: { name: { equals: value, mode: "insensitive" } },
          select: { id: true },
        });
        if (labels.length === 0) {
          problems.push(`No label “${value}”`);
          continue;
        }
        r = { kind: "label", labelIds: labels.map((x) => x.id) };
        break;
      }
    }
    if (!r) {
      problems.push(`Cannot read “${text(p)}”`);
      continue;
    }
    if (!PREDICATE_SUPPORT[r.kind].includes(entity)) {
      problems.push(`“${text(p)}” does not apply to ${NOUN[entity]} — ignored`);
      continue;
    }
    resolved.push(r);
  }
  return { resolved, problems };
}

const RATING_OPS = new Set([">=", "<=", ">", "<", "="]);

/** People shown in image `x` (ADR-0023): on-camera cast minus hidden, or linked directly */
function imageShows(x: Prisma.Sql, people: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM "MediaItem" mi
      JOIN "SessionContribution" sc ON sc."sessionId" = mi."sessionId"
      JOIN "ContributionRoleDefinition" rd ON rd.id = sc."roleDefinitionId"
      JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
      WHERE mi.id = ${x} AND sc."personId" IN (${people}) AND rg.name <> ${BEHIND_CAMERA_GROUP}
        AND NOT EXISTS (SELECT 1 FROM media_item_hidden_person h WHERE h."mediaItemId" = ${x} AND h."personId" = sc."personId")
    )
    OR EXISTS (SELECT 1 FROM "PersonMediaLink" pml WHERE pml."mediaItemId" = ${x} AND pml."personId" IN (${people}))
  )`;
}

function castIncludes(entity: TaggableEntity, x: Prisma.Sql, people: Prisma.Sql): Prisma.Sql {
  switch (entity) {
    case "MEDIA_ITEM":
      return imageShows(x, people);
    case "SET":
      return Prisma.sql`EXISTS (SELECT 1 FROM "SetParticipant" sp WHERE sp."setId" = ${x} AND sp."personId" IN (${people}))`;
    case "SESSION":
      return Prisma.sql`EXISTS (SELECT 1 FROM "SessionContribution" sc WHERE sc."sessionId" = ${x} AND sc."personId" IN (${people}))`;
    case "PERSON":
      return Prisma.sql`${x} IN (${people})`;
    case "PROJECT":
    case "ARCHIVE_FOLDER":
      return Prisma.sql`FALSE`;
  }
}

const OWN_TAGS: Record<TaggableEntity, { table: string; column: string }> = {
  MEDIA_ITEM: { table: "media_item_tag", column: "mediaItemId" },
  SET: { table: "set_tag", column: "setId" },
  SESSION: { table: "session_tag", column: "sessionId" },
  PERSON: { table: "person_tag", column: "personId" },
  PROJECT: { table: "project_tag", column: "projectId" },
  ARCHIVE_FOLDER: { table: "archive_folder_tag", column: "archiveFolderId" },
};

/** SQL for one resolved predicate on row `x` of the entity */
export function predicateSql(entity: TaggableEntity, p: ResolvedPredicate, x: Prisma.Sql): Prisma.Sql {
  const own = OWN_TAGS[entity];
  const ownTable = Prisma.raw(`"${own.table}"`);
  const ownCol = Prisma.raw(`"${own.column}"`);
  switch (p.kind) {
    case "fav":
      return entity === "PERSON"
        ? Prisma.sql`EXISTS (SELECT 1 FROM "Person" f WHERE f.id = ${x} AND f."isFavorite")`
        : Prisma.sql`EXISTS (SELECT 1 FROM "MediaItem" f WHERE f.id = ${x} AND f."isFavorite")`;
    case "untagged":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM ${ownTable} t WHERE t.${ownCol} = ${x})`;
    case "workflow":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${ownTable} t
        JOIN tag_definition td ON td.id = t."tagDefinitionId"
        JOIN tag_group tg ON tg.id = td."groupId"
        WHERE t.${ownCol} = ${x} AND tg.kind = 'WORKFLOW')`;
    case "rating": {
      const op = Prisma.raw(RATING_OPS.has(p.op) ? p.op : "=");
      const table = Prisma.raw(entity === "PERSON" ? `"Person"` : `"Set"`);
      return Prisma.sql`EXISTS (SELECT 1 FROM ${table} r WHERE r.id = ${x} AND r.rating ${op} ${p.value})`;
    }
    case "person":
      return castIncludes(entity, x, Prisma.join(p.personIds));
    case "persontag":
      return castIncludes(entity, x, Prisma.sql`SELECT "personId" FROM person_tag WHERE "tagDefinitionId" IN (${Prisma.join(p.tagIds)})`);
    case "label": {
      const labels = Prisma.join(p.labelIds);
      if (entity === "SESSION") return Prisma.sql`EXISTS (SELECT 1 FROM "Session" s WHERE s.id = ${x} AND s."labelId" IN (${labels}))`;
      if (entity === "SET")
        return Prisma.sql`EXISTS (SELECT 1 FROM "Set" st JOIN "Channel" c ON c.id = st."channelId" WHERE st.id = ${x} AND c."labelId" IN (${labels}))`;
      return Prisma.sql`(
        EXISTS (SELECT 1 FROM "MediaItem" mi JOIN "Session" s ON s.id = mi."sessionId" WHERE mi.id = ${x} AND s."labelId" IN (${labels}))
        OR EXISTS (SELECT 1 FROM "SetMediaItem" smi JOIN "Set" st ON st.id = smi."setId" JOIN "Channel" c ON c.id = st."channelId"
                   WHERE smi."mediaItemId" = ${x} AND c."labelId" IN (${labels}))
      )`;
    }
    case "type":
      return entity === "SET"
        ? Prisma.sql`EXISTS (SELECT 1 FROM "Set" st WHERE st.id = ${x} AND st.type::text = ${p.value})`
        : Prisma.sql`EXISTS (SELECT 1 FROM "MediaItem" mi WHERE mi.id = ${x} AND mi."mediaType"::text = ${p.value.toUpperCase()})`;
  }
}
