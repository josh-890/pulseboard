"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
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
import { applyCoverCheckAction } from "@/lib/actions/media-actions";
import type { CoverCheckFile, CoverCheckKind, CoverCheckRow } from "@/lib/services/cover-check-service";
import { cn } from "@/lib/utils";

export type CoverCheckReviewProps = { rows: CoverCheckRow[] };

const GROUPS: { kind: CoverCheckKind; title: string; hint: string; preselect: boolean }[] = [
  {
    kind: "variant",
    title: "A second cover art is the cover",
    hint: "Title-c1 (or -c2 …) became the cover while Title-c is there — parallel uploads, whichever arrived last.",
    preselect: true,
  },
  {
    kind: "import",
    title: "The cover from the import",
    hint: "The picture carried over when the set was promoted, while the archive's Title-c is in the set.",
    preselect: true,
  },
  {
    kind: "sameUpload",
    title: "A photo from the same upload",
    hint: "A photo that arrived together with the cover art and happened to be first.",
    preselect: true,
  },
  {
    kind: "photo",
    title: "A photo from another upload",
    hint: "Perhaps picked by you before the set remembered picks. Not selected: tick the ones that should show the cover art.",
    preselect: false,
  },
];

/** Review list for the cover check: current cover → cover art, tick to switch, the rest keep theirs. */
export function CoverCheckReview({ rows }: CoverCheckReviewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => GROUPS.find((g) => g.kind === r.kind)?.preselect).map((r) => r.setId)),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const byKind = useMemo(() => {
    const m = new Map<CoverCheckKind, CoverCheckRow[]>();
    for (const r of rows) m.set(r.kind, [...(m.get(r.kind) ?? []), r]);
    return m;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 text-sm text-muted-foreground shadow-md backdrop-blur-sm">
        Every automatic cover is the set&apos;s best cover art — nothing to check.
      </div>
    );
  }

  const keepCount = rows.length - selected.size;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setGroup = (items: CoverCheckRow[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of items) {
        if (on) next.add(r.setId);
        else next.delete(r.setId);
      }
      return next;
    });

  function runApply() {
    setConfirmOpen(false);
    const switchIds = [...selected];
    const keepIds = rows.filter((r) => !selected.has(r.setId)).map((r) => r.setId);
    startTransition(async () => {
      const r = await applyCoverCheckAction(switchIds, keepIds);
      if (r.success) {
        toast.success(`${r.switched} cover${r.switched === 1 ? "" : "s"} switched, ${r.kept} kept`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-white/20 bg-card/90 p-3 shadow-md backdrop-blur-md">
        <span className="text-sm" aria-live="polite">
          {selected.size} switch · {keepCount} keep
        </span>
        <Button size="sm" className="ml-auto gap-1.5" disabled={pending} onClick={() => setConfirmOpen(true)}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Apply
        </Button>
      </div>

      {GROUPS.map((g) => {
        const items = byKind.get(g.kind) ?? [];
        if (items.length === 0) return null;
        const allOn = items.every((r) => selected.has(r.setId));
        return (
          <section key={g.kind} aria-labelledby={`cc-${g.kind}`} className="space-y-3" data-testid={`cover-check-group-${g.kind}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`cc-${g.kind}`} className="text-base font-semibold">
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
              {items.map((r) => {
                const on = selected.has(r.setId);
                return (
                  <li
                    key={r.setId}
                    data-testid="cover-check-row"
                    data-set-id={r.setId}
                    className={cn(
                      "rounded-xl border bg-card/70 p-3 shadow-sm backdrop-blur-sm transition-colors",
                      on ? "border-primary/50" : "border-white/20",
                    )}
                  >
                    <label className="mb-2 flex cursor-pointer items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.setId)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                        aria-label={`Switch ${r.setTitle} to ${r.best.filename}`}
                      />
                      <Link href={`/sets/${r.setId}`} className="min-w-0 truncate font-medium hover:underline">
                        {r.setTitle}
                      </Link>
                    </label>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <Figure f={r.current} note={on ? "replaced" : "stays the cover"} lit={!on} />
                      <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
                      <Figure f={r.best} note={on ? "becomes the cover" : "stays cover art"} lit={on} />
                    </div>
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
            <AlertDialogTitle>Update {rows.length} covers?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} set{selected.size === 1 ? "" : "s"} switch to their cover art. The other {keepCount} keep
              their cover, and it counts as picked by hand: no upload replaces it. Nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runApply}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Figure({ f, note, lit }: { f: CoverCheckFile | null; note: string; lit: boolean }) {
  return (
    <figure className="min-w-0">
      <div className={cn("relative overflow-hidden rounded-md bg-black/30 ring-2", lit ? "ring-amber-500" : "ring-transparent")}>
        {f ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.thumbUrl ?? ""} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center text-[11px] text-muted-foreground">no cover</div>
        )}
        {lit && (
          <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
            cover
          </span>
        )}
      </div>
      <figcaption className="mt-1 space-y-0.5 text-[11px]">
        <span className="block truncate" title={f?.filename}>
          {f?.filename ?? "—"}
        </span>
        <span className="block text-muted-foreground">
          {f ? `${f.width}×${f.height} · ` : ""}
          {note}
        </span>
      </figcaption>
    </figure>
  );
}
