"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, CornerDownLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  compositionOf,
  impliedTags,
  openDraft,
  pathByTag,
  toggleTag,
  findCombination,
  type ComposerCatalog,
  type ComposerStateRule,
} from "@/lib/composer";
import { applyCompositionAction, ensureStateCombinationAction } from "@/lib/actions/composer-actions";
import type { ComposerPhoto } from "@/lib/services/composer-service";
import { ComposerInspector } from "./composer-inspector";
import { ComposerFilmstrip } from "./composer-filmstrip";
import type { TileState } from "./composer-tile";

export type ComposerWorkbenchProps = {
  catalog: ComposerCatalog;
  title: string;
  backHref: string;
  photos: ComposerPhoto[];
  initialPhotoId: string | null;
};

const PIN_KEY = "composer.pinned";

function readPins(catalog: ComposerCatalog): Set<string> {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    if (raw) {
      const names = JSON.parse(raw) as string[];
      return new Set(catalog.paths.filter((p) => names.includes(p.name)).map((p) => p.id));
    }
  } catch {
    // storage blocked — fall back to the catalogue's defaults
  }
  return new Set(catalog.paths.filter((p) => p.pinned).map((p) => p.id));
}

/**
 * The tag workbench (ADR-0042): one photo big, the Composer beside it, the set
 * along the bottom. Enter writes the draft and moves on; → moves on without
 * writing; ← goes back; 1–4 switch paths; Esc leaves. Pinned paths carry the
 * last written tags over to the next photo as a proposal.
 */
export function ComposerWorkbench({ catalog: initialCatalog, title, backHref, photos, initialPhotoId }: ComposerWorkbenchProps) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initialCatalog);
  const [own, setOwn] = useState<Record<string, string[]>>(() => Object.fromEntries(photos.map((p) => [p.id, p.tagIds])));
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === initialPhotoId)));
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(initialCatalog.paths.filter((p) => p.pinned).map((p) => p.id)));
  const [lastWritten, setLastWritten] = useState<string[]>([]);
  const [activePathId, setActivePathId] = useState(initialCatalog.paths[0]?.id ?? "");
  const [creating, setCreating] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(0);

  const photo = photos[index];
  const [draftState, setDraftState] = useState(() =>
    openDraft(initialCatalog, photo ? photos[index].tagIds : [], [], new Set()),
  );
  const { draft, proposed } = draftState;

  // Pins come from this browser once mounted (no hydration mismatch)
  useEffect(() => {
    setPinned(readPins(initialCatalog));
  }, [initialCatalog]);

  const byPath = useMemo(() => pathByTag(catalog), [catalog]);

  const open = useCallback(
    (i: number, ownMap: Record<string, string[]>, written: string[]) => {
      const target = photos[i];
      if (!target) return;
      setIndex(i);
      setDraftState(openDraft(catalog, ownMap[target.id] ?? [], written, pinned));
      const url = new URL(window.location.href);
      url.searchParams.set("photo", target.id);
      window.history.replaceState(null, "", url);
    },
    [catalog, photos, pinned],
  );

  const toggle = useCallback(
    (tagId: string, additive: boolean) => {
      setDraftState((s) => ({ draft: toggleTag(catalog, s.draft, tagId, additive), proposed: s.proposed.filter((id) => id !== tagId) }));
    },
    [catalog],
  );

  const onCombination = useCallback(
    (rule: ComposerStateRule, garmentId: string) => {
      const existing = findCombination(catalog, rule, garmentId);
      if (existing) return toggle(existing.id, false);
      const key = `${rule.stateGroupId}:${garmentId}`;
      setCreating(key);
      startTransition(async () => {
        const r = await ensureStateCombinationAction(rule.stateGroupId, garmentId);
        setCreating(null);
        if (!r.success) return void toast.error(r.error);
        const t = r.tag;
        setCatalog((c) => ({
          ...c,
          tags: { ...c.tags, [t.id]: t },
          groups: c.groups[t.groupId]?.tagIds.includes(t.id)
            ? c.groups
            : { ...c.groups, [t.groupId]: { ...c.groups[t.groupId], tagIds: [...c.groups[t.groupId].tagIds, t.id] } },
        }));
        setDraftState((s) => ({ draft: s.draft.includes(t.id) ? s.draft : [...s.draft, t.id], proposed: s.proposed }));
      });
    },
    [catalog, toggle],
  );

  /** Enter: write what changed, remember it for carry-over, go on */
  const applyAndNext = useCallback(() => {
    if (!photo) return;
    const before = own[photo.id] ?? [];
    const { adds, removes } = compositionOf(before, draft);
    const written = draft;
    const nextOwn = { ...own, [photo.id]: draft };
    setLastWritten(written);
    if (adds.length || removes.length) {
      setOwn(nextOwn);
      setSaving((n) => n + 1);
      const id = photo.id;
      void applyCompositionAction([id], adds, removes).then((r) => {
        setSaving((n) => n - 1);
        if (!r.success) {
          toast.error(`${photo.filename}: ${r.error}`);
          setOwn((o) => ({ ...o, [id]: before }));
        } else setOwn((o) => ({ ...o, [id]: r.tags[id] ?? o[id] }));
      });
    }
    if (index < photos.length - 1) open(index + 1, nextOwn, written);
    else {
      setDraftState({ draft, proposed: [] });
      toast.success("Last photo — all written");
    }
  }, [photo, own, draft, index, photos.length, open]);

  const next = useCallback(() => index < photos.length - 1 && open(index + 1, own, lastWritten), [index, photos.length, open, own, lastWritten]);
  const prev = useCallback(() => index > 0 && open(index - 1, own, lastWritten), [index, open, own, lastWritten]);

  const togglePin = useCallback(
    (pathId: string) => {
      setPinned((p) => {
        const n = new Set(p);
        if (n.has(pathId)) n.delete(pathId);
        else n.add(pathId);
        try {
          window.localStorage.setItem(PIN_KEY, JSON.stringify(catalog.paths.filter((x) => n.has(x.id)).map((x) => x.name)));
        } catch {
          // storage blocked — the pin holds for this visit
        }
        return n;
      });
    },
    [catalog.paths],
  );

  // Keyboard: the workbench is a keyboard tool
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        applyAndNext();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        router.push(backHref);
      } else if (/^[1-9]$/.test(e.key)) {
        const p = catalog.paths[Number(e.key) - 1];
        if (p) setActivePathId(p.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyAndNext, next, prev, router, backHref, catalog.paths]);

  const implied = useMemo(() => new Set(impliedTags(catalog, draft)), [catalog, draft]);
  const proposedSet = useMemo(() => new Set(proposed), [proposed]);
  const draftSet = useMemo(() => new Set(draft), [draft]);
  const tileState = useCallback(
    (id: string): TileState => (proposedSet.has(id) ? "proposed" : draftSet.has(id) ? "on" : implied.has(id) ? "implied" : "off"),
    [proposedSet, draftSet, implied],
  );

  const coverage = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const p of photos) out[p.id] = new Set((own[p.id] ?? []).map((t) => byPath.get(t)).filter((x): x is string => !!x));
    return out;
  }, [photos, own, byPath]);

  const countByPath = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of draft) {
      const p = byPath.get(t);
      if (p) out[p] = (out[p] ?? 0) + 1;
    }
    return out;
  }, [draft, byPath]);

  const { adds, removes } = photo ? compositionOf(own[photo.id] ?? [], draft) : { adds: [], removes: [] };
  const name = (id: string) => catalog.tags[id]?.name ?? "?";

  if (!photo)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No photos here yet. <Link href={backHref} className="text-primary hover:underline">Back</Link>
      </div>
    );

  return (
    <div ref={shellRef} className="flex h-[calc(100dvh-4rem)] flex-col" data-testid="composer-workbench">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 text-sm">
        <Link href={backHref} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="min-w-0 truncate font-medium">{title}</span>
        <span className="text-muted-foreground tabular-nums" data-testid="composer-position">
          {index + 1} / {photos.length}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground md:inline" title={photo.filename}>
          {photo.filename}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saving > 0 && (
            <>
              <Loader2 size={12} className="animate-spin" /> saving
            </>
          )}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[35vh] flex-1 items-center justify-center bg-black/80 lg:min-h-0">
          {photo.viewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
            <img src={photo.viewUrl} alt={photo.filename} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-white/60">No preview</span>
          )}
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/70 disabled:opacity-0"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={index === photos.length - 1}
            aria-label="Next photo without writing"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/70 disabled:opacity-0"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <aside className="flex min-h-0 flex-col border-t border-border/60 bg-card/80 backdrop-blur-md lg:w-[30rem] lg:border-l lg:border-t-0">
          <ComposerInspector
            catalog={catalog}
            activePathId={activePathId}
            onPath={setActivePathId}
            pinned={pinned}
            onPin={togglePin}
            draft={draft}
            tileState={tileState}
            onToggle={toggle}
            onCombination={onCombination}
            creating={creating}
            countByPath={countByPath}
          />

          <footer className="space-y-2 border-t border-border/60 p-3">
            <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1 text-[11px]" data-testid="composer-diff" aria-live="polite">
              {adds.length === 0 && removes.length === 0 ? (
                <span className="text-muted-foreground">No changes on this photo</span>
              ) : (
                <>
                  {adds.map((id) => (
                    <span
                      key={id}
                      className={cn(
                        "rounded-full border px-1.5 py-0.5",
                        proposedSet.has(id)
                          ? "border-dashed border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                          : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      )}
                      title={proposedSet.has(id) ? "Carried over from the last photo" : undefined}
                    >
                      + {name(id)}
                    </span>
                  ))}
                  {removes.map((id) => (
                    <span key={id} className="rounded-full border border-rose-500/50 bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
                      − {name(id)}
                    </span>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prev} disabled={index === 0} className="gap-1">
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={next} disabled={index === photos.length - 1} className="gap-1" data-testid="composer-skip">
                Skip <ChevronRight size={14} />
              </Button>
              <Button size="sm" onClick={applyAndNext} className="ml-auto gap-1.5" data-testid="composer-apply">
                <CornerDownLeft size={14} />
                {adds.length || removes.length ? "Apply & next" : "Next"}
              </Button>
            </div>
          </footer>
        </aside>
      </div>

      <ComposerFilmstrip
        photos={photos}
        paths={catalog.paths}
        coverage={coverage}
        currentIndex={index}
        onJump={(i) => open(i, own, lastWritten)}
      />
    </div>
  );
}
