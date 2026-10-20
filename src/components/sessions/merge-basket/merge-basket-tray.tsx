"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, GitMerge, ShoppingBasket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sessionMergeHref } from "@/lib/session-merge-href";
import { cn } from "@/lib/utils";
import { useMergeBasket } from "./merge-basket-store";

// The merge basket, floating bottom-right on every page while it holds a
// session (2026-10-20). Two in it → Compare & merge. Hidden on the compare page
// itself, which has its own bar; it moves up while a selection bar or the photo
// compare tray takes the bottom edge.

export function MergeBasketTray() {
  const { items, remove, clear } = useMergeBasket();
  const pathname = usePathname();
  const router = useRouter();

  if (items.length === 0 || pathname.startsWith("/sessions/merge")) return null;
  const [a, b] = items;

  return (
    <aside
      aria-label="Merge basket"
      data-merge-basket=""
      className={cn(
        "fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-2 rounded-2xl border border-white/20 bg-card/95 p-2 pl-3 shadow-2xl backdrop-blur-xl",
        "sm:inset-x-auto sm:right-4 sm:flex-nowrap dark:border-white/10",
        "[body:has([data-tag-selection-active])_&]:bottom-20 [body:has([data-compare-tray])_&]:bottom-20",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShoppingBasket size={14} aria-hidden="true" className="text-primary" /> Merge basket
      </span>

      <ul className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
        {items.map((it) => (
          <li key={it.id} className="flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background/50 py-0.5 pl-0.5 pr-1">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
              {it.thumbUrl ? (
                <Image src={it.thumbUrl} alt="" fill unoptimized className="object-cover" />
              ) : (
                <Clapperboard size={14} aria-hidden="true" className="absolute inset-0 m-auto text-muted-foreground/50" />
              )}
            </div>
            <Link href={`/sessions/${it.id}`} className="min-w-0 truncate text-xs hover:underline" title={it.name}>
              {it.name}
            </Link>
            <button
              type="button"
              onClick={() => remove(it.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${it.name} from the merge basket`}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
        {items.length === 1 && (
          <li className="min-w-0 text-[11px] leading-tight text-muted-foreground">Add one more session to compare</li>
        )}
      </ul>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!a || !b}
          onClick={() => a && b && router.push(sessionMergeHref(a.id, b.id, `${pathname}${window.location.search}`))}
        >
          <GitMerge size={14} aria-hidden="true" /> Compare &amp; merge
        </Button>
        <button
          type="button"
          onClick={clear}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Empty the merge basket"
          title="Empty the merge basket"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
