"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, ImageIcon, Loader2, Star, User } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn, focalStyle } from "@/lib/utils";
import type { Peek, PeekImage } from "@/lib/services/peek-service";
import type { PeekList } from "./peek-provider";

type PeekSheetProps = {
  list: PeekList | null;
  onIndex: (index: number) => void;
  onClose: () => void;
};

type Loaded = Peek | "missing";

/** The Peek side panel: the card of the list's current entry, ← → through the list */
export function PeekSheet({ list, onIndex, onClose }: PeekSheetProps) {
  const [cache, setCache] = useState<Record<string, Loaded>>({});
  const id = list ? list.ids[list.index] : null;
  const key = list && id ? `${list.type}:${id}` : null;
  const data = key ? cache[key] : undefined;

  const requested = useRef(new Set<string>());

  // Load the current card and its neighbours (so stepping is instant), once each.
  useEffect(() => {
    if (!list) return;
    for (const i of [list.index, list.index + 1, list.index - 1]) {
      const x = list.ids[i];
      const k = `${list.type}:${x}`;
      if (!x || requested.current.has(k)) continue;
      requested.current.add(k);
      fetch(`/api/peek?type=${list.type}&id=${encodeURIComponent(x)}`)
        .then(async (r): Promise<Loaded> => (r.ok ? ((await r.json()) as Peek) : "missing"))
        .catch((): Loaded => "missing")
        .then((v) => setCache((c) => ({ ...c, [k]: v })));
    }
  }, [list]);

  if (!list) return <Sheet open={false} />;

  const hasPrev = list.index > 0;
  const hasNext = list.index < list.ids.length - 1;
  const step = (d: number) => {
    const i = list.index + d;
    if (i >= 0 && i < list.ids.length) onIndex(i);
  };
  const openPage = () => {
    onClose();
    if (id) list.open(id);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        data-testid="peek"
        className="w-full gap-0 border-white/20 p-0 sm:max-w-md"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          } else if (e.key === "Enter" && !(e.target as HTMLElement).closest("a,button")) {
            e.preventDefault();
            openPage();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-white/15 px-4 py-3 pr-12">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={list.title}>
            {list.title}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="peek-position">
            {list.index + 1} / {list.ids.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {data === undefined ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground" aria-live="polite">
              <Loader2 className="animate-spin" size={20} aria-label="Loading" />
              <SheetTitle className="sr-only">{list.names[list.index] ?? "Loading"}</SheetTitle>
            </div>
          ) : data === "missing" ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <SheetTitle className="text-base">{list.names[list.index]}</SheetTitle>
              This page could not be loaded.
            </div>
          ) : (
            <PeekBody peek={data} onNavigate={onClose} />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/15 px-4 py-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!hasPrev}
            aria-label={hasPrev ? `Previous: ${list.names[list.index - 1] ?? ""}` : "Previous"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!hasNext}
            aria-label={hasNext ? `Next: ${list.names[list.index + 1] ?? ""}` : "Next"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">← → step · Enter open · Esc close</span>
          <button
            type="button"
            onClick={openPage}
            data-testid="peek-open"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open page <ExternalLink size={14} aria-hidden="true" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Picture({ image, alt, className, fallback }: { image: PeekImage | null; alt: string; className: string; fallback: "person" | "set" }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted/50", className)}>
      {image ? (
        <Image src={image.url} alt={alt} fill unoptimized sizes="400px" style={focalStyle(image.focalX, image.focalY)} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          {fallback === "person" ? <User size={28} /> : <ImageIcon size={28} />}
        </span>
      )}
    </div>
  );
}

function Rating({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`rated ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} className={i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} aria-hidden="true" />
      ))}
    </span>
  );
}

function PeekBody({ peek, onNavigate }: { peek: Peek; onNavigate: () => void }) {
  return (
    <div className="space-y-4">
      <Picture image={peek.image} alt={peek.name} fallback={peek.type} className="mx-auto aspect-[3/4] w-full max-w-[18rem] rounded-xl" />
      <div className="space-y-1.5">
        <SheetTitle className="text-lg font-semibold leading-tight">{peek.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{peek.facts.join(" · ")}</SheetDescription>
        <Rating value={peek.rating} />
      </div>

      {peek.type === "person" && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">
            Sets · {peek.setCount}
          </h3>
          {peek.sets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sets yet.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {peek.sets.map((s) => (
                <li key={s.id}>
                  <Link href={`/sets/${s.id}`} onClick={onNavigate} className="group block focus-visible:outline-none" title={s.detail ? `${s.title} · ${s.detail}` : s.title}>
                    <Picture image={s.cover} alt="" fallback="set" className="aspect-[3/4] rounded-lg ring-primary transition group-hover:opacity-90 group-focus-visible:ring-2" />
                    <span className="mt-1 block truncate text-[11px] font-medium">{s.title}</span>
                    {s.detail && <span className="block truncate text-[10px] text-muted-foreground">{s.detail}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {peek.type === "set" && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">Cast · {peek.cast.length}</h3>
          {peek.cast.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one credited yet.</p>
          ) : (
            <ul className="space-y-1">
              {peek.cast.map((c) => (
                <li key={c.id}>
                  <Link href={`/people/${c.id}`} onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
                    <Picture image={c.image} alt="" fallback="person" className="h-9 w-9 shrink-0 rounded-full" />
                    <span className="truncate text-sm font-medium">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
