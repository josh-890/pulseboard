import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buildSessionWhere } from "@/lib/services/session-service";
import { buildSetWhere } from "@/lib/services/set-service";
import { sessionListFilters, setListFilters, type ListParams } from "@/lib/services/list-filters";
import { parseRateParam } from "@/lib/rating-queue";
import { ratedSql } from "@/lib/services/tag-predicates";

// The rating queue (2026-10-25): a /sessions or /sets list walked session by
// session on the session page, `?rate=sessions?<the list's query>`. It holds
// the list's sessions with models still to rate — not rated yet or to review —
// in channel order (the primary set's channel: a channel keeps a style), then
// by date. The session on screen stays in it once confirmed, so Prev/Next
// keep their place; the others drop out as they are done.

export type RatingQueue = {
  /** Where the queue came from, to go back to */
  listHref: string;
  /** 1-based place of the session on screen, null when it is not in the list */
  position: number | null;
  /** Sessions in the queue, the one on screen counted */
  total: number;
  prevId: string | null;
  nextId: string | null;
  /** The channel of the session on screen */
  channel: string | null;
};

async function listSessionIds(from: "sessions" | "sets", params: ListParams): Promise<string[]> {
  if (from === "sessions") {
    const { filters } = await sessionListFilters(params);
    const rows = await prisma.session.findMany({ where: buildSessionWhere(filters), select: { id: true } });
    return rows.map((r) => r.id);
  }
  const { filters } = await setListFilters(params);
  const rows = await prisma.setSession.findMany({
    where: { set: await buildSetWhere(filters) },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  return rows.map((r) => r.sessionId);
}

export async function getRatingQueue(rate: string | undefined, sessionId: string): Promise<RatingQueue | null> {
  const parsed = parseRateParam(rate);
  if (!parsed) return null;
  const ids = await listSessionIds(parsed.from, parsed.params);
  const listHref = `/${parsed.from}${parsed.query ? `?${parsed.query}` : ""}`;
  const x = Prisma.sql`s.id`;
  const rows =
    ids.length === 0
      ? []
      : await prisma.$queryRaw<{ id: string; channel: string | null }[]>`
          SELECT s.id, ch.name AS channel
          FROM "Session" s
          LEFT JOIN LATERAL (
            SELECT c.name FROM "SetSession" ss
            JOIN "Set" st ON st.id = ss."setId"
            JOIN "Channel" c ON c.id = st."channelId"
            WHERE ss."sessionId" = s.id
            ORDER BY ss."isPrimary" DESC, st."releaseDate" ASC NULLS LAST, st.id
            LIMIT 1
          ) ch ON TRUE
          WHERE s.id IN (${Prisma.join(ids)})
            AND (s.id = ${sessionId} OR ${ratedSql("SESSION", "unrated", x)} OR ${ratedSql("SESSION", "review", x)})
          ORDER BY lower(ch.name) ASC NULLS LAST, s.date ASC NULLS LAST, s.name, s.id`;
  const at = rows.findIndex((r) => r.id === sessionId);
  return {
    listHref,
    position: at < 0 ? null : at + 1,
    total: rows.length,
    prevId: at > 0 ? rows[at - 1]!.id : null,
    nextId: at < 0 ? (rows[0]?.id ?? null) : (rows[at + 1]?.id ?? null),
    channel: at < 0 ? null : rows[at]!.channel,
  };
}
