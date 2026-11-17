"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteCoverDuplicatesAction } from "@/lib/actions/media-actions";
import type { CoverDuplicate, CoverDuplicateKind } from "@/lib/services/cover-art-cleanup-service";
import { cn } from "@/lib/utils";

export type CoverDuplicatesReviewProps = { candidates: CoverDuplicate[] };

const GROUPS: { kind: CoverDuplicateKind; title: string; hint: string; preselect: boolean }[] = [
  {
    kind: "copy",
    title: "Two copies of the cover art",
    hint: "The same publisher cover twice (cover.jpg and Title-c.jpg) — the larger one stays.",
    preselect: true,
  },
  {
    kind: "standIn",
    title: "Stand-ins of a photo",
    hint: "The small thumbnail carried over at promotion, now that the real photo is in the set.",
    preselect: true,
  },
  {
    kind: "crop",
    title: "Cover art close to a photo",
    hint: "A Title-c.jpg that looks like a set photo — often the publisher's crop of it, with lettering. Not selected: tick only what is a plain copy.",
    preselect: false,
  },
];

/** Review list for the cover-art duplicates cleanup: side by side, tick, delete. */
export function CoverDuplicatesReview({ candidates }: CoverDuplicatesReviewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.filter((c) => GROUPS.find((g) => g.kind === c.kind)?.preselect).map((c) => c.id)),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const byKind = useMemo(() => {
    const m = new Map<CoverDuplicateKind, CoverDuplicate[]>();
    for (const c of candidates) m.set(c.kind, [...(m.get(c.kind) ?? []), c]);
    return m;
  }, [candidates]);

  if (candidates.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 text-sm text-muted-foreground shadow-md backdrop-blur-sm">
        No cover-art duplicates — nothing to clean up.
      </div>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setGroup = (items: CoverDuplicate[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of items) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });

  function runDelete() {
    setConfirmOpen(false);
    const ids = [...selected];
    startTransition(async () => {
      const r = await deleteCoverDuplicatesAction(ids);
      if (r.success) {
        toast.success(`${r.deleted} duplicate${r.deleted === 1 ? "" : "s"} deleted`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-white/20 bg-card/90 p-3 shadow-md backdrop-blur-md">
        <span className="text-sm" aria-live="polite">
          {selected.size} of {candidates.length} selected
        </span>
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={selected.size === 0 || pending}
          onClick={() => setConfirmOpen(true)}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete {selected.size} selected
        </Button>
      </div>

      {GROUPS.map((g) => {
        const items = byKind.get(g.kind) ?? [];
        if (items.length === 0) return null;
        const allOn = items.every((c) => selected.has(c.id));
        return (
          <section key={g.kind} aria-labelledby={`dup-${g.kind}`} className="space-y-3" data-testid={`dup-group-${g.kind}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`dup-${g.kind}`} className="text-base font-semibold">
                {g.title} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setGroup(items, !allOn)}
                className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {allOn ? "Select none" : "Select all"}
              </button>
              <p className="w-full text-xs text-muted-foreground">{g.hint}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((c) => {
                const on = selected.has(c.id);
                return (
                  <li
                    key={c.id}
                    data-testid="dup-row"
                    data-media-id={c.id}
                    className={cn(
                      "rounded-xl border bg-card/70 p-3 shadow-sm backdrop-blur-sm transition-colors",
                      on ? "border-destructive/50" : "border-white/20",
                    )}
                  >
                    <label className="mb-2 flex cursor-pointer items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.id)}
                        className="mt-0.5 h-4 w-4 accent-destructive"
                        aria-label={`Delete ${c.filename} from ${c.setTitle}`}
                      />
                      <Link href={`/sets/${c.setId}`} className="min-w-0 truncate font-medium hover:underline">
                        {c.setTitle}
                      </Link>
                    </label>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <Figure url={c.thumbUrl} name={c.filename} w={c.width} h={c.height} note={on ? "deleted" : "stays"} warn={on} cover={c.isCover} />
                      <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
                      <Figure url={c.keptThumbUrl} name={c.keptFilename} w={c.keptWidth} h={c.keptHeight} note={c.keptIsArt ? "stays · cover art" : "stays · photo"} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{c.distance} bits apart</p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} cover-art files?</AlertDialogTitle>
            <AlertDialogDescription>
              They are removed for good, from the sets and the storage. A cover they held moves to the file that stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={runDelete}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type FigureProps = { url: string | null; name: string; w: number; h: number; note: string; warn?: boolean; cover?: boolean };

function Figure({ url, name, w, h, note, warn, cover }: FigureProps) {
  return (
    <figure className="min-w-0">
      <div className="relative overflow-hidden rounded-md bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url ?? ""} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
        {cover && (
          <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
            cover
          </span>
        )}
      </div>
      <figcaption className="mt-1 space-y-0.5 text-[11px]">
        <span className="block truncate" title={name}>
          {name}
        </span>
        <span className="block text-muted-foreground">
          {w}×{h} · <span className={cn(warn && "font-medium text-destructive")}>{note}</span>
        </span>
      </figcaption>
    </figure>
  );
}
