"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, X } from "lucide-react";
import { rateHref } from "@/lib/rating-queue";
import type { RatingQueue } from "@/lib/services/rating-queue-service";
import { cn } from "@/lib/utils";

export type RatingQueueBarProps = {
  queue: RatingQueue;
  /** The page's `rate=` value, carried to the next session */
  rate: string;
};

// Rating a list session by session (2026-10-25): where the queue stands, the
// channel (the style hint), Prev / Next — also [ and ] — and the way back.
// Confirming in the panel goes on by itself.
export function RatingQueueBar({ queue, rate }: RatingQueueBarProps) {
  const router = useRouter();
  const prev = queue.prevId ? rateHref(queue.prevId, rate) : null;
  const next = queue.nextId ? rateHref(queue.nextId, rate) : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "[" && prev) router.push(prev);
      else if (e.key === "]" && next) router.push(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const step = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors";
  return (
    <nav
      aria-label="Rating queue"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm backdrop-blur-md"
    >
      <ListChecks size={15} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="font-medium tabular-nums">
        {queue.position ? `Rating ${queue.position} / ${queue.total}` : `${queue.total} to rate`}
      </span>
      {queue.channel && <span className="min-w-0 truncate text-muted-foreground">· {queue.channel}</span>}
      <span className="ml-auto flex items-center gap-1">
        {prev ? (
          <Link href={prev} className={cn(step, "hover:bg-muted")} title="Previous ( [ )">
            <ChevronLeft size={13} aria-hidden="true" /> Prev
          </Link>
        ) : (
          <span className={cn(step, "text-muted-foreground/50")} aria-disabled="true">
            <ChevronLeft size={13} aria-hidden="true" /> Prev
          </span>
        )}
        {next ? (
          <Link href={next} className={cn(step, "hover:bg-muted")} title="Next without confirming ( ] )">
            Next <ChevronRight size={13} aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(step, "text-muted-foreground/50")} aria-disabled="true">
            Last one
          </span>
        )}
        <Link href={queue.listHref} className={cn(step, "text-muted-foreground hover:bg-muted hover:text-foreground")} aria-label="Leave the rating queue">
          <X size={13} aria-hidden="true" /> List
        </Link>
      </span>
    </nav>
  );
}
