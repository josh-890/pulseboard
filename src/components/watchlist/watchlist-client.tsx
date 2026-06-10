"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  ExternalLink,
  Check,
  Upload,
  ChevronRight,
  AlertTriangle,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime, getDisplayName } from "@/lib/utils";
import { markPersonChecked } from "@/lib/actions/person-actions";
import type { WatchlistEntry, WatchlistPage } from "@/lib/services/person-service";
import type { WatchPriority } from "@/generated/prisma/client";

const PRIORITY_STYLES: Record<WatchPriority, string> = {
  HIGH: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  NORMAL: "border-white/20 bg-muted/50 text-muted-foreground",
  LOW: "border-white/10 bg-muted/30 text-muted-foreground/70",
};

const DUE_STYLES: Record<WatchlistPage["dueLevel"], string> = {
  fresh: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  due: "border-amber-500/40 bg-amber-500/15 text-amber-500",
  overdue: "border-red-500/40 bg-red-500/15 text-red-500",
};

/** Pages that should be pre-checked when entering the page: due + overdue. */
function initialSelection(entries: WatchlistEntry[]): Set<string> {
  const sel = new Set<string>();
  for (const e of entries) {
    for (const pg of e.scannablePages) {
      if (pg.dueLevel !== "fresh") sel.add(pg.id);
    }
  }
  return sel;
}

export function WatchlistClient({ entries }: { entries: WatchlistEntry[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() =>
    initialSelection(entries),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  function markChecked(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await markPersonChecked(id);
      setPendingId(null);
      if (!res.success) {
        toast.error(res.error ?? "Failed to mark checked");
        return;
      }
      toast.success("Marked checked");
      router.refresh();
    });
  }

  function togglePage(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePerson(pages: WatchlistPage[]) {
    const ids = pages.map((p) => p.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Sticky-bar tallies: people with ≥1 selected page, total pages, platforms.
  const tally = useMemo(() => {
    let people = 0;
    const platforms = new Set<string>();
    for (const e of entries) {
      const chosen = e.scannablePages.filter((p) => selected.has(p.id));
      if (chosen.length > 0) people += 1;
      for (const p of chosen) platforms.add(p.platform);
    }
    return { people, pages: selected.size, platforms: platforms.size };
  }, [entries, selected]);

  async function generate() {
    const identityIds = [...selected];
    if (identityIds.length === 0) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/scan-round/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityIds }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        toast.error(msg?.error ?? "Failed to generate scan files");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulseboard-scan-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Scan files downloaded");
    } catch {
      toast.error("Failed to generate scan files");
    } finally {
      setGenerating(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 py-16 text-sm text-muted-foreground">
        <Eye size={28} className="opacity-40" />
        <p>No one on the watchlist yet.</p>
        <p className="text-xs text-muted-foreground/70">
          Open a person and hit the <span className="font-medium">eye</span> beside their
          name to monitor them for new sets.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 pb-24">
        {entries.map((e) => {
          const name = getDisplayName(e.commonAlias, e.icgId);
          const hasGap = e.missing.total !== null && e.missing.total > 0;
          const pageIds = e.scannablePages.map((p) => p.id);
          const selCount = pageIds.filter((id) => selected.has(id)).length;
          const allOn = pageIds.length > 0 && selCount === pageIds.length;
          const someOn = selCount > 0 && !allOn;
          const isExpanded = expanded.has(e.id);
          const worstDue = e.scannablePages.reduce<WatchlistPage["dueLevel"]>(
            (acc, p) =>
              p.dueLevel === "overdue" || acc === "overdue"
                ? "overdue"
                : p.dueLevel === "due" || acc === "due"
                  ? "due"
                  : "fresh",
            "fresh",
          );
          return (
            <div
              key={e.id}
              className={cn(
                "rounded-xl border border-white/10 bg-card/60 backdrop-blur-sm transition-colors",
                e.needsRescan && "border-amber-500/30",
                pendingId === e.id && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                {/* Person select */}
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  disabled={pageIds.length === 0}
                  onChange={() => togglePerson(e.scannablePages)}
                  aria-label={`Select ${name} for scan round`}
                  className="size-4 shrink-0 accent-primary disabled:opacity-30"
                />

                {/* Priority */}
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    PRIORITY_STYLES[e.priority],
                  )}
                >
                  {e.priority.toLowerCase()}
                </span>

                {/* Name */}
                <Link
                  href={`/people/${e.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
                  title={name}
                >
                  {name}
                </Link>

                {/* Needs-rescan flag */}
                {e.needsRescan && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500"
                    title={
                      e.rescanSetDate
                        ? `Archive set newer than last scan (${formatRelativeTime(e.rescanSetDate)})`
                        : "Archive set newer than last scan"
                    }
                  >
                    <AlertTriangle size={10} />
                    rescan
                  </span>
                )}

                {/* Due badge (worst page) */}
                {e.scannablePages.length > 0 && worstDue !== "fresh" && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                      DUE_STYLES[worstDue],
                    )}
                  >
                    {worstDue}
                  </span>
                )}

                {/* Gap (missing = claimed − recorded) */}
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {e.missing.total === null ? (
                    <span className="text-muted-foreground/40" title="No claimed figure on record">
                      no claim
                    </span>
                  ) : hasGap ? (
                    <span className="text-amber-500" title="Known-missing sets (claimed − recorded)">
                      missing {e.missing.photos ?? 0}p · {e.missing.videos ?? 0}v
                    </span>
                  ) : (
                    <span className="text-emerald-500">complete</span>
                  )}
                </span>

                {/* Scan freshness */}
                <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 lg:block">
                  {e.newestScannedThroughAt
                    ? `scanned ${formatRelativeTime(e.newestScannedThroughAt)}`
                    : e.scannablePages.length > 0
                      ? "never scanned"
                      : "no scannable pages"}
                </span>

                {/* Quick-check links */}
                <div className="flex shrink-0 items-center gap-1">
                  {e.links.map((l, i) => (
                    <a
                      key={`${l.platform}-${i}`}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      title={l.platform}
                      className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      {l.platform}
                      <ExternalLink size={9} />
                    </a>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => markChecked(e.id)}
                    disabled={pendingId === e.id}
                    title="Mark checked now"
                    className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-emerald-500"
                  >
                    <Check size={12} />
                    Checked
                  </button>
                  <Link
                    href="/import"
                    title="Go to Import"
                    className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Upload size={12} />
                    Import
                  </Link>
                  {e.scannablePages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(e.id)}
                      aria-expanded={isExpanded}
                      aria-label="Toggle scannable pages"
                      className="inline-flex size-7 items-center justify-center rounded-md border border-border/50 bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronRight
                        size={14}
                        className={cn("transition-transform", isExpanded && "rotate-90")}
                      />
                    </button>
                  )}
                </div>

                {/* Note (full-width when present) */}
                {e.note && (
                  <p className="w-full pl-1 text-[11px] italic text-muted-foreground/60">
                    {e.note}
                  </p>
                )}
              </div>

              {/* Per-page selection */}
              {isExpanded && e.scannablePages.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-white/10 px-4 py-2 pl-10">
                  {e.scannablePages.map((pg) => (
                    <label
                      key={pg.id}
                      className="flex cursor-pointer items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(pg.id)}
                        onChange={() => togglePage(pg.id)}
                        className="size-3.5 accent-primary"
                      />
                      <span className="w-24 shrink-0 truncate font-medium">{pg.platform}</span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[9px] font-medium capitalize",
                          DUE_STYLES[pg.dueLevel],
                        )}
                      >
                        {pg.dueLevel}
                      </span>
                      <span className="text-muted-foreground/60">
                        {pg.scannedThroughAt
                          ? `scanned ${formatRelativeTime(pg.scannedThroughAt)}`
                          : "never scanned"}
                      </span>
                      <a
                        href={pg.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto truncate text-muted-foreground/50 hover:text-primary"
                        title={pg.url}
                      >
                        <ExternalLink size={11} />
                      </a>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky generate bar */}
      {tally.pages > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{tally.people}</span>{" "}
              {tally.people === 1 ? "person" : "people"} ·{" "}
              <span className="font-semibold text-foreground">{tally.pages}</span>{" "}
              {tally.pages === 1 ? "page" : "pages"} ·{" "}
              <span className="font-semibold text-foreground">{tally.platforms}</span>{" "}
              {tally.platforms === 1 ? "platform" : "platforms"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md border border-border/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Generate scan files
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
