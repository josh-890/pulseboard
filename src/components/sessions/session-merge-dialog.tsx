"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getSessionMergeCandidatesAction } from "@/lib/actions/session-actions";
import { sessionMergeHref } from "@/lib/session-merge-href";
import type { SessionMergeCandidate, SessionMergeCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MergeReasonChips } from "./merge-reason-chips";
import { MergeSessionCard } from "./merge-session-card";

// Merge two sessions (2026-10-18). Each set used to get its own session; when two
// sets clearly came from one shoot, their sessions become one — the older one,
// wherever the merge was started. Names are often no help ("Set 1" twice), so the
// dialog suggests sessions that share people, label or project (with the reasons)
// and shows each by its sets; the search also finds set titles, people and labels.
// Picking one opens the compare page (2026-10-20), where both sessions are seen
// in full before anything is merged.

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

export function SessionMergeDialog({ sessionId, open, onOpenChange }: SessionMergeDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [active, setActive] = useState(0);
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
      const c = candidates[activeIndex];
      if (c) compare(c);
    }
  }

  function compare(other: SessionMergeCandidate) {
    handleOpenChange(false);
    router.push(sessionMergeHref(sessionId, other.id, `/sessions/${sessionId}`));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge with another session</DialogTitle>
          <DialogDescription>
            Pick the session these sets were really shot in — you then compare the two side by side. The older one
            stays; the other is merged into it.
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
                  onClick={() => compare(c)}
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
      </DialogContent>
    </Dialog>
  );
}
