import Link from "next/link";
import NextImage from "next/image";
import { BookMarked, Camera, Film, Star } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { ChannelWall, ChannelWallRow } from "@/lib/services/channel-wall-service";
import type { StagingSetStatus } from "@/generated/prisma/client";

export type WallScope = "library" | "all";
export type WallType = "any" | "photo" | "video";
export type WallSort = "newest" | "oldest" | "rating";

export const WALL_PAGE = 240;

type ChannelSetWallProps = {
  wall: ChannelWall;
  scope: WallScope;
  type: WallType;
  sort: WallSort;
  /** How many tiles to render — a channel can know thousands of sets */
  limit: number;
  /** The tab's own address, e.g. /channels/x?tab=sets */
  basePath: string;
};

const STATUS_LABEL: Partial<Record<StagingSetStatus, string>> = {
  PENDING: "Pending",
  REVIEWING: "In review",
  APPROVED: "Approved",
  SKIPPED: "Skipped",
};

const STATUS_DOT: Partial<Record<StagingSetStatus, string>> = {
  PENDING: "bg-slate-400",
  REVIEWING: "bg-sky-400",
  APPROVED: "bg-emerald-400",
  SKIPPED: "bg-zinc-500",
};

function isoDate(d: Date | null): string {
  if (!d) return "undated";
  return d.toISOString().slice(0, 10);
}

function sortRows(rows: ChannelWallRow[], sort: WallSort): ChannelWallRow[] {
  const t = (r: ChannelWallRow) => r.releaseDate?.getTime() ?? -Infinity;
  const sorted = [...rows];
  if (sort === "oldest") sorted.sort((a, b) => (a.releaseDate?.getTime() ?? Infinity) - (b.releaseDate?.getTime() ?? Infinity));
  else if (sort === "rating") sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || t(b) - t(a));
  else sorted.sort((a, b) => t(b) - t(a));
  return sorted;
}

/** Year sections in the order of the sort (rating: one section) */
function groupByYear(rows: ChannelWallRow[], sort: WallSort): { label: string; rows: ChannelWallRow[] }[] {
  if (sort === "rating") return [{ label: "By your rating", rows }];
  const groups: { label: string; rows: ChannelWallRow[] }[] = [];
  for (const r of rows) {
    const label = r.releaseDate ? String(r.releaseDate.getUTCFullYear()) : "Undated";
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-md border border-border bg-background p-0.5">
      {children}
    </div>
  );
}

function Tile({ row }: { row: ChannelWallRow }) {
  const cast = row.castNames.slice(0, 2).join(", ") + (row.castNames.length > 2 ? ` +${row.castNames.length - 2}` : "");
  const tooltip = [row.title, isoDate(row.releaseDate), row.castNames.join(", ")].filter(Boolean).join(" · ");
  const body = (
    <>
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-md",
          row.kind === "catalogue"
            ? "border border-dashed border-black/15 bg-black/[0.02] dark:border-white/20 dark:bg-white/[0.03]"
            : "bg-black/[0.06] ring-1 ring-black/10 dark:bg-white/[0.06] dark:ring-white/10",
        )}
      >
        {row.coverUrl ? (
          <NextImage
            src={row.coverUrl}
            alt=""
            fill
            unoptimized
            loading="lazy"
            sizes="160px"
            style={focalStyle(row.coverFocalX, row.coverFocalY)}
            className={cn(
              "object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]",
              row.kind === "staged" && "opacity-70 group-hover:opacity-100",
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center text-muted-foreground/70">
            {row.kind === "catalogue" ? <BookMarked size={20} /> : row.isVideo ? <Film size={20} /> : <Camera size={20} />}
            {row.kind === "catalogue" && <span className="line-clamp-3 text-[10px] leading-snug">{row.title}</span>}
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
          {row.kind === "staged" && row.status && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status])} aria-hidden="true" />
              {STATUS_LABEL[row.status] ?? "Staged"}
            </span>
          )}
          {row.kind === "catalogue" && (
            <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/80">Catalogue</span>
          )}
          {row.isVideo && (
            <span className="rounded-full bg-black/60 p-1 text-white" aria-label="Video">
              <Film size={10} />
            </span>
          )}
        </div>
        {row.rating !== null && row.rating > 0 && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            <Star size={10} className="fill-amber-300" aria-hidden="true" />
            {row.rating}
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <p className={cn("line-clamp-2 text-xs font-medium leading-snug", row.kind === "catalogue" ? "text-muted-foreground" : "text-foreground")}>
          {row.title}
        </p>
        <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">{isoDate(row.releaseDate)}</p>
        {cast && <p className="truncate text-[10px] text-muted-foreground">{cast}</p>}
      </div>
    </>
  );
  const className = cn(
    "group flex min-w-0 flex-col gap-1.5 rounded-lg p-1 transition-colors duration-150",
    row.kind === "catalogue" && "opacity-70",
  );
  return row.href ? (
    <Link href={row.href} title={tooltip} className={cn(className, "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div title={`${tooltip} · in the catalogue only`} className={className}>
      {body}
    </div>
  );
}

/**
 * The channel's sets as a wall of covers, by year. Library = your sets; All adds
 * its staged sets and what only the catalogue knows, dimmer, so the gaps show.
 */
export function ChannelSetWall({ wall, scope, type, sort, limit, basePath }: ChannelSetWallProps) {
  const href = (patch: Partial<{ scope: WallScope; type: WallType; sort: WallSort; limit: number }>) => {
    // A new filter starts at the first page again
    const next = { scope, type, sort, limit: WALL_PAGE, ...patch };
    const params = new URLSearchParams();
    if (next.scope !== "library") params.set("scope", next.scope);
    if (next.type !== "any") params.set("type", next.type);
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.limit > WALL_PAGE) params.set("limit", String(next.limit));
    const q = params.toString();
    return q ? `${basePath}&${q}` : basePath;
  };

  const known = wall.counts.set + wall.counts.staged + wall.counts.catalogue;
  const inScope = wall.rows.filter((r) => (scope === "library" ? r.kind === "set" : true));
  const shown = inScope.filter((r) => (type === "any" ? true : type === "video" ? r.isVideo : !r.isVideo));
  const sorted = sortRows(shown, sort);
  const groups = groupByYear(sorted.slice(0, limit), sort);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {known === 0 ? (
            "No sets known for this channel yet."
          ) : (
            <>
              You have <span className="font-semibold text-foreground">{wall.counts.set.toLocaleString()}</span> of{" "}
              <span className="font-semibold text-foreground">{known.toLocaleString()}</span> known sets
              <span className="ml-1 tabular-nums">({Math.round((wall.counts.set / known) * 100)} %)</span>
              {(wall.counts.staged > 0 || wall.counts.catalogue > 0) && (
                <span className="ml-1.5">
                  · {wall.counts.staged.toLocaleString()} staged · {wall.counts.catalogue.toLocaleString()} only in the catalogue
                </span>
              )}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PillGroup label="Which sets">
            <Pill href={href({ scope: "library" })} active={scope === "library"}>
              Library {wall.counts.set.toLocaleString()}
            </Pill>
            <Pill href={href({ scope: "all" })} active={scope === "all"}>
              All {known.toLocaleString()}
            </Pill>
          </PillGroup>
          <PillGroup label="Type">
            <Pill href={href({ type: "any" })} active={type === "any"}>
              All types
            </Pill>
            <Pill href={href({ type: "photo" })} active={type === "photo"}>
              <Camera size={12} aria-hidden="true" /> Photo
            </Pill>
            <Pill href={href({ type: "video" })} active={type === "video"}>
              <Film size={12} aria-hidden="true" /> Video
            </Pill>
          </PillGroup>
          <PillGroup label="Sort">
            <Pill href={href({ sort: "newest" })} active={sort === "newest"}>
              Newest
            </Pill>
            <Pill href={href({ sort: "oldest" })} active={sort === "oldest"}>
              Oldest
            </Pill>
            <Pill href={href({ sort: "rating" })} active={sort === "rating"}>
              <Star size={12} aria-hidden="true" /> Rating
            </Pill>
          </PillGroup>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-sm text-muted-foreground">
          {scope === "library" && known > wall.counts.set
            ? "None of its sets is in your library yet — All shows what is known of it."
            : "No sets match."}
        </p>
      ) : (
        groups.map((g) => (
          <details key={g.label} open className="group/year [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
            <summary className="sticky top-0 z-10 -mx-1 flex cursor-pointer list-none items-center gap-2 rounded-lg bg-background/80 px-1 py-1.5 backdrop-blur-sm">
              <span className="text-sm font-semibold">{g.label}</span>
              <span className="rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{g.rows.length}</span>
              <span className="h-px flex-1 bg-border/40" />
            </summary>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
              {g.rows.map((r) => (
                <Tile key={`${r.kind}:${r.key}`} row={r} />
              ))}
            </div>
          </details>
        ))
      )}

      {sorted.length > limit && (
        <div className="flex flex-col items-center gap-1 py-2">
          <p className="text-xs text-muted-foreground">
            Showing {limit.toLocaleString()} of {sorted.length.toLocaleString()}
          </p>
          <Link
            href={href({ limit: limit + WALL_PAGE })}
            scroll={false}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show {Math.min(WALL_PAGE, sorted.length - limit).toLocaleString()} more
          </Link>
        </div>
      )}
    </div>
  );
}
