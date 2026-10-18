"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUp, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getSessionMergeCandidatesAction, mergeSessionsOldestSurvives } from "@/lib/actions/session-actions";
import { resolveMergeDirection, type MergeDirectionReason } from "@/lib/session-merge-direction";
import type { SessionMergeCandidate, SessionMergeCard } from "@/lib/types";
import { cn, formatPartialDateISO } from "@/lib/utils";
import { MergeReasonChips } from "./merge-reason-chips";
import { MergeSessionCard } from "./merge-session-card";

// Merge two sessions (2026-10-18). Each set used to get its own session; when two
// sets clearly came from one shoot, their sessions become one — the older one,
// wherever the merge was started. Names are often no help ("Set 1" twice), so the
// dialog suggests sessions that share people, label or project (with the reasons)
// and shows each by its sets; the search also finds set titles, people and labels.

type SessionMergeDialogProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Loaded = {
  key: string;
  self: SessionMergeCard | null;
  candidates: SessionMergeCandidate[];
  error: boolean;
};

function olderBecause(reason: MergeDirectionReason, card: SessionMergeCard): string {
  if (reason === "date") return `Older — session date ${formatPartialDateISO(card.date, card.datePrecision)}`;
  if (reason === "set-release") {
    const first = card.sets.find((s) => s.releaseDate);
    return `Older — first set released ${formatPartialDateISO(card.earliestRelease, first?.releaseDatePrecision ?? "DAY")}`;
  }
  return "Older — created first";
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the surviving session holds after the merge */
function afterwards(a: SessionMergeCard, b: SessionMergeCard): string {
  const people = new Set([...a.people, ...b.people].map((p) => p.id)).size;
  const sets = new Set([...a.sets, ...b.sets].map((s) => s.id)).size;
  return [count(a.mediaCount + b.mediaCount, "photo", "photos"), count(people, "person", "people"), count(sets, "set", "sets")].join(" · ");
}

function Badge({ tone, children }: { tone: "stays" | "goes"; children: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "stays"
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      )}
    >
      {children}
    </span>
  );
}

export function SessionMergeDialog({ sessionId, open, onOpenChange }: SessionMergeDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<SessionMergeCandidate | null>(null);
  const [merging, setMerging] = useState(false);
  const requestSeq = useRef(0);

  // Typing settles for 300 ms before it searches
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setSearchKey(query.trim()), 300);
    return () => clearTimeout(t);
  }, [open, query]);

  // Suggestions on open (empty key), search results otherwise — the newest answer wins
  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    getSessionMergeCandidatesAction(sessionId, searchKey || undefined)
      .then((res) => ({ key: searchKey, self: res.self, candidates: res.candidates, error: false }))
      .catch(() => ({ key: searchKey, self: null, candidates: [], error: true }))
      .then((next) => {
        if (seq === requestSeq.current) setLoaded(next);
      });
  }, [open, sessionId, searchKey]);

  const loading = !loaded || loaded.key !== searchKey || query.trim() !== searchKey;
  const self = loaded?.self ?? null;
  const candidates = loaded?.candidates ?? [];
  const activeIndex = Math.min(active, Math.max(0, candidates.length - 1));

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setSearchKey("");
      setLoaded(null);
      setSelected(null);
      setActive(0);
    }
    onOpenChange(next);
  }

  function handleListKey(e: React.KeyboardEvent) {
    if (candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" && !loading) {
      e.preventDefault();
      setSelected(candidates[activeIndex] ?? null);
    }
  }

  async function handleMerge(other: SessionMergeCandidate) {
    setMerging(true);
    const result = await mergeSessionsOldestSurvives(sessionId, other.id);
    setMerging(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Sessions merged");
    handleOpenChange(false);
    if (result.survivorId === sessionId) router.refresh();
    else router.push(`/sessions/${result.survivorId}`);
  }

  const direction = self && selected ? resolveMergeDirection(self, selected) : null;
  const survivor = direction && self && selected ? (direction.survivorId === self.id ? self : selected) : null;
  const absorbed = survivor && self && selected ? (survivor.id === self.id ? selected : self) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {!selected || !self || !survivor || !absorbed || !direction ? (
          <>
            <DialogHeader>
              <DialogTitle>Merge with another session</DialogTitle>
              <DialogDescription>
                Pick the session these sets were really shot in. The older of the two stays; the other is merged into it.
              </DialogDescription>
            </DialogHeader>

            {self ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">This session</p>
                <MergeSessionCard card={self} compact />
              </div>
            ) : (
              <div aria-hidden="true" className="h-28 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
            )}

            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by session, set, person or label…"
                aria-label="Search sessions"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={handleListKey}
                role="combobox"
                aria-expanded={candidates.length > 0}
                aria-controls="session-merge-candidates"
                aria-activedescendant={candidates[activeIndex] ? `merge-candidate-${candidates[activeIndex].id}` : undefined}
                className="pl-9"
                autoFocus
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {searchKey ? "Matches" : "Suggested — shares people, label or project"}
              </p>
              {loading ? (
                <div className="space-y-2" aria-busy="true" aria-label="Loading sessions">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
                  ))}
                </div>
              ) : loaded?.error ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  Could not load sessions. Close the dialog and try again.
                </p>
              ) : candidates.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  {searchKey
                    ? "No session matches. Try a set title, a person's name or ICG-ID, or a label."
                    : "No session shares people, label or project with this one. Search by set, person or label."}
                </p>
              ) : (
                <ul id="session-merge-candidates" role="listbox" aria-label="Sessions to merge with" className="space-y-2">
                  {candidates.map((c, i) => (
                    <li
                      key={c.id}
                      id={`merge-candidate-${c.id}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onClick={() => setSelected(c)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3 transition-colors duration-150",
                        i === activeIndex ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/40",
                      )}
                    >
                      <MergeSessionCard card={c} footer={<MergeReasonChips reasons={c.reasons} />} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Merge these two sessions?</DialogTitle>
              <DialogDescription>
                The older session stays. The other one&apos;s photos, people and sets move into it.
              </DialogDescription>
            </DialogHeader>

            <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-3" data-merge-role="survivor">
                <MergeSessionCard card={survivor} badge={<Badge tone="stays">Stays</Badge>} />
                <p className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-300">{olderBecause(direction.reason, survivor)}</p>
              </div>
              <div className="flex justify-center text-muted-foreground" aria-hidden="true">
                <ArrowLeft size={20} className="hidden md:block" />
                <ArrowUp size={20} className="md:hidden" />
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3" data-merge-role="absorbed">
                <MergeSessionCard card={absorbed} badge={<Badge tone="goes">Merged in</Badge>} />
              </div>
            </div>

            {survivor.id !== self.id && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                This session is the newer one — it is merged into &ldquo;{survivor.name}&rdquo;, and you will land there.
              </p>
            )}

            <div className="rounded-lg border border-border p-3 text-xs">
              <p className="font-medium">Afterwards: {afterwards(survivor, absorbed)}</p>
              <p className="mt-1 text-muted-foreground">
                Name, label and description stay those of &ldquo;{survivor.name}&rdquo;.
              </p>
            </div>

            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                &ldquo;{absorbed.name}&rdquo; is deleted after the merge. This can&apos;t be undone.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)} disabled={merging}>
                Back
              </Button>
              <Button variant="destructive" onClick={() => handleMerge(selected)} disabled={merging}>
                {merging && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {merging ? "Merging…" : "Merge sessions"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
