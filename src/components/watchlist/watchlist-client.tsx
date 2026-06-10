"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, ExternalLink, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime, getDisplayName } from "@/lib/utils";
import { markPersonChecked } from "@/lib/actions/person-actions";
import type { WatchlistEntry } from "@/lib/services/person-service";
import type { WatchPriority } from "@/generated/prisma/client";

const PRIORITY_STYLES: Record<WatchPriority, string> = {
  HIGH: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  NORMAL: "border-white/20 bg-muted/50 text-muted-foreground",
  LOW: "border-white/10 bg-muted/30 text-muted-foreground/70",
};

export function WatchlistClient({ entries }: { entries: WatchlistEntry[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 py-16 text-sm text-muted-foreground">
        <Eye size={28} className="opacity-40" />
        <p>No one on the watchlist yet.</p>
        <p className="text-xs text-muted-foreground/70">
          Open a person and hit <span className="font-medium">Watch</span> to monitor them for new sets.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => {
        const name = getDisplayName(e.commonAlias, e.icgId);
        const hasGap = e.missing.total !== null && e.missing.total > 0;
        return (
          <div
            key={e.id}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-card/60 px-4 py-3 backdrop-blur-sm transition-colors",
              pendingId === e.id && "opacity-60",
            )}
          >
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

            {/* Dates */}
            <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 sm:block">
              checked {e.checkedAt ? formatRelativeTime(e.checkedAt) : "never"}
              {e.lastSetAddedAt && (
                <span className="text-muted-foreground/50">
                  {" "}· last set {formatRelativeTime(e.lastSetAddedAt)}
                </span>
              )}
            </span>

            {/* Quick-check links: digital identities + watch source */}
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
              {e.sourceUrl && (
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={e.sourceUrl}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  source
                  <ExternalLink size={9} />
                </a>
              )}
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
            </div>

            {/* Note (full-width when present) */}
            {e.note && (
              <p className="w-full pl-1 text-[11px] italic text-muted-foreground/60">{e.note}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
