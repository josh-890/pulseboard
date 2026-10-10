import { prisma } from "@/lib/db";
import { getDisplayName } from "@/lib/utils";
import { getAttributionQueue } from "./attribution-confirm-service";
import { getUploadWorklist } from "./archive-upload-service";
import { countOpenTodos } from "./tag-browse-service";

// The dashboard (2026-10-11): live numbers, activity derived from the data itself
// (every record already carries a timestamp — nothing has to remember to log), the
// queues that wait for the user, and what the agents last did.

// ─── KPIs ────────────────────────────────────────────────────────────────────

export type DashboardKpis = {
  persons: number;
  sets: number;
  sessions: number;
  images: number;
  /** Staged sets still in the pipeline (pending, reviewing, approved) */
  staged: number;
  /** Archive folders on disk without a confirmed link to a set or staged set */
  orphanFolders: number;
  labels: number;
  channels: number;
  projects: number;
};

/** Counted live — the old snapshot view lagged by hundreds of rows between deploys */
export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [persons, sets, sessions, images, staged, orphanFolders, labels, channels, projects] = await Promise.all([
    prisma.person.count(),
    prisma.set.count(),
    prisma.session.count(),
    prisma.mediaItem.count({ where: { isAnnotation: false } }),
    prisma.stagingSet.count({ where: { status: { in: ["PENDING", "REVIEWING", "APPROVED"] } } }),
    prisma.archiveFolder.count({
      where: { missingOnDisk: false, OR: [{ archiveLink: null }, { archiveLink: { status: { not: "CONFIRMED" } } }] },
    }),
    prisma.label.count(),
    prisma.channel.count(),
    prisma.project.count(),
  ]);
  return { persons, sets, sessions, images, staged, orphanFolders, labels, channels, projects };
}

// ─── Activity ────────────────────────────────────────────────────────────────

export type ActivityKind = "promoted" | "images" | "folders" | "person" | "import" | "agent" | "logged";

export type ActivityEvent = {
  kind: ActivityKind;
  time: Date;
  title: string;
  detail?: string;
  href?: string;
};

export type ActivityDay = { day: string; events: ActivityEvent[] };

/** The zone days and times are shown in — the server itself may run in UTC */
export const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE ?? "Europe/Berlin";
const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIMEZONE }).format(d);

const AGENT_LABEL: Record<string, string> = {
  "archive-scan": "Archive scan",
  "archive-cover": "Archive covers",
  "archive-upload": "Archive upload",
};

/** What happened in the last `days` days, newest day first, newest event first */
export async function getDashboardActivity(days = 14): Promise<ActivityDay[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [promoted, images, looseImages, folders, persons, imports, runs, logged] = await Promise.all([
    // A promoted set is created at the moment of promotion
    prisma.set.findMany({
      where: { createdAt: { gte: since }, stagingPromotions: { some: {} } },
      select: { id: true, title: true, createdAt: true },
    }),
    // Images added to sets, per set and day — by the upload agent or by hand
    prisma.$queryRaw<Array<{ setId: string; title: string; day: Date; n: bigint; last: Date; agent: boolean }>>`
      SELECT smi."setId", s.title, date_trunc('day', mi."createdAt") AS day, count(*)::bigint AS n,
             max(mi."createdAt") AS last,
             (s."archiveUploadStartedAt" IS NOT NULL AND mi."createdAt" >= s."archiveUploadStartedAt") AS agent
      FROM "SetMediaItem" smi
      JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
      JOIN "Set" s ON s.id = smi."setId"
      WHERE mi."createdAt" >= ${since} AND NOT mi."isTransferredCover" AND NOT mi."isAnnotation"
      GROUP BY 1, 2, 3, 6`,
    // Images that belong to no set (a person's reference session, …), per session and day
    prisma.$queryRaw<Array<{ sessionId: string; name: string; day: Date; n: bigint; last: Date }>>`
      SELECT mi."sessionId", se.name, date_trunc('day', mi."createdAt") AS day, count(*)::bigint AS n, max(mi."createdAt") AS last
      FROM "MediaItem" mi
      JOIN "Session" se ON se.id = mi."sessionId"
      WHERE mi."createdAt" >= ${since} AND NOT mi."isAnnotation"
        AND NOT EXISTS (SELECT 1 FROM "SetMediaItem" smi WHERE smi."mediaItemId" = mi.id)
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<Array<{ day: Date; n: bigint; last: Date; sample: string[] }>>`
      SELECT date_trunc('day', "discoveredAt") AS day, count(*)::bigint AS n, max("discoveredAt") AS last,
             (array_agg("folderName" ORDER BY "discoveredAt" DESC))[1:3] AS sample
      FROM archive_folder WHERE "discoveredAt" >= ${since}
      GROUP BY 1`,
    prisma.person.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, icgId: true, createdAt: true, aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
    }),
    prisma.importBatch.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, filename: true, status: true, createdAt: true },
    }),
    prisma.agentRun.findMany({ where: { finishedAt: { gte: since }, dryRun: false } }),
    prisma.activity.findMany({ where: { time: { gte: since } } }),
  ]);

  const events: ActivityEvent[] = [
    ...promoted.map((s) => ({ kind: "promoted" as const, time: s.createdAt, title: `Promoted “${s.title}”`, href: `/sets/${s.id}` })),
    ...images.map((r) => ({
      kind: "images" as const,
      time: r.last,
      title: `${r.title} · ${Number(r.n)} image${Number(r.n) === 1 ? "" : "s"}`,
      detail: r.agent ? "via the upload agent" : "added by hand",
      href: `/sets/${r.setId}`,
    })),
    ...looseImages.map((r) => ({
      kind: "images" as const,
      time: r.last,
      title: `${r.name} · ${Number(r.n)} image${Number(r.n) === 1 ? "" : "s"}`,
      detail: "session (no set)",
      href: `/sessions/${r.sessionId}`,
    })),
    ...folders.map((r) => ({
      kind: "folders" as const,
      time: r.last,
      title: `${Number(r.n)} new archive folder${Number(r.n) === 1 ? "" : "s"}`,
      detail: (r.sample ?? []).join(" · ") + (Number(r.n) > 3 ? " · …" : ""),
      href: "/archive",
    })),
    ...persons.map((p) => ({
      kind: "person" as const,
      time: p.createdAt,
      title: `New person ${getDisplayName(p.aliases[0]?.name ?? null, p.icgId)}`,
      href: `/people/${p.id}`,
    })),
    ...imports.map((b) => ({
      kind: "import" as const,
      time: b.createdAt,
      title: `Import ${b.filename}`,
      detail: b.status.toLowerCase(),
      href: "/import",
    })),
    ...runs.map((r) => ({
      kind: "agent" as const,
      time: r.finishedAt,
      title: `${AGENT_LABEL[r.agent] ?? r.agent}${r.ok ? "" : " — finished with errors"}`,
      detail: r.summary,
    })),
    ...logged.map((a) => ({ kind: "logged" as const, time: a.time, title: a.title })),
  ];

  const byDay = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const day = dayOf(e.time);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, events: list.sort((a, b) => b.time.getTime() - a.time.getTime()) }));
}

// ─── Needs you ───────────────────────────────────────────────────────────────

export type NeedsYouItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  hint?: string;
  /** A few names to act on directly (failed uploads) */
  items?: { label: string; href: string; detail?: string }[];
};

/** The queues waiting for a decision or a run — only the non-empty ones */
export async function getNeedsYou(): Promise<NeedsYouItem[]> {
  const [toReview, approved, uploadQueue, failedSets, todos, attribution, unknownTagFolders, stubs] = await Promise.all([
    prisma.stagingSet.count({ where: { status: { in: ["PENDING", "REVIEWING"] } } }),
    prisma.stagingSet.count({ where: { status: "APPROVED" } }),
    getUploadWorklist(),
    prisma.set.findMany({
      where: { archiveUploadFailed: { isEmpty: false } },
      select: { id: true, title: true, archiveUploadFailed: true },
      orderBy: { archiveUploadDoneAt: "desc" },
      take: 20,
    }),
    countOpenTodos(),
    getAttributionQueue({ limit: 1 }).catch(() => null),
    prisma.archiveFolder.count({
      where: { OR: [{ tagMarkersUnknown: { isEmpty: false } }, { tagMarkersConflicts: { isEmpty: false } }] },
    }),
    prisma.archiveFolder.count({ where: { stubSince: { not: null }, missingOnDisk: false } }),
  ]);

  const items: NeedsYouItem[] = [
    { key: "review", label: "Staged sets to review", count: toReview, href: "/staging-sets" },
    { key: "promote", label: "Approved, ready to promote", count: approved, href: "/staging-sets" },
    {
      key: "upload",
      label: "Sets waiting for their images",
      count: uploadQueue.length,
      href: "/sets",
      hint: "Run archive-upload.ps1 on the archive machine",
    },
    {
      key: "failed",
      label: "Sets with images that did not upload",
      count: failedSets.length,
      href: "/sets",
      items: failedSets.slice(0, 5).map((s) => ({
        label: s.title,
        href: `/sets/${s.id}`,
        detail: `${s.archiveUploadFailed.length} file${s.archiveUploadFailed.length === 1 ? "" : "s"}: ${s.archiveUploadFailed.slice(0, 2).join(", ")}${s.archiveUploadFailed.length > 2 ? ", …" : ""}`,
      })),
    },
    { key: "todo", label: "Workflow to-dos", count: todos, href: "/tags?view=todo" },
    {
      key: "attribution",
      label: "Archive folders: who is in them?",
      count: attribution?.counts.openFolders ?? 0,
      href: "/archive/attribution",
    },
    {
      key: "tags",
      label: "Archive folders with unknown #tag names",
      count: unknownTagFolders,
      href: "/archive",
      hint: "Click the amber chip on the folder to say which tag it means",
    },
    { key: "stubs", label: "Stub copies waiting for the real set", count: stubs, href: "/archive" },
  ];
  return items.filter((i) => i.count > 0);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export type AgentStatus = {
  agent: string;
  label: string;
  last: { finishedAt: Date; ok: boolean; summary: string } | null;
  /** When the run was not reported (older agent version): seen from the data */
  lastSeen: Date | null;
};

/** The last real (not dry) run of each agent, or when its effect was last seen */
export async function getAgentStatus(): Promise<AgentStatus[]> {
  const agents = Object.keys(AGENT_LABEL);
  const [runs, scanned, covered, uploaded] = await Promise.all([
    Promise.all(
      agents.map((agent) =>
        prisma.agentRun.findFirst({ where: { agent, dryRun: false }, orderBy: { finishedAt: "desc" } }),
      ),
    ),
    prisma.archiveFolder.aggregate({ _max: { scannedAt: true } }),
    prisma.archiveFolder.aggregate({ _max: { coverCheckedAt: true } }),
    prisma.set.aggregate({ _max: { archiveUploadDoneAt: true } }),
  ]);
  const seen: Record<string, Date | null> = {
    "archive-scan": scanned._max.scannedAt,
    "archive-cover": covered._max.coverCheckedAt,
    "archive-upload": uploaded._max.archiveUploadDoneAt,
  };
  return agents.map((agent, i) => {
    const r = runs[i];
    return {
      agent,
      label: AGENT_LABEL[agent],
      last: r ? { finishedAt: r.finishedAt, ok: r.ok, summary: r.summary } : null,
      lastSeen: seen[agent] ?? null,
    };
  });
}

// ─── Agent reports ───────────────────────────────────────────────────────────

export async function recordAgentRun(input: {
  agent: string;
  startedAt: Date;
  ok: boolean;
  dryRun: boolean;
  summary: string;
  details?: unknown;
}): Promise<void> {
  await prisma.agentRun.create({
    data: {
      agent: input.agent.slice(0, 40),
      startedAt: input.startedAt,
      ok: input.ok,
      dryRun: input.dryRun,
      summary: input.summary.slice(0, 500),
      details: input.details === undefined ? undefined : JSON.parse(JSON.stringify(input.details)),
    },
  });
}
