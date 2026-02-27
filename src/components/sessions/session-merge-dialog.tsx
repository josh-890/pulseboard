"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Merge, Search, ArrowRight, AlertTriangle } from "lucide-react";
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
import { searchSessionsAction, mergeSessions } from "@/lib/actions/session-actions";
import { SessionStatusBadge } from "./session-status-badge";
import type { SessionStatus } from "@/lib/types";

type SearchResult = {
  id: string;
  name: string;
  status: SessionStatus;
  date: Date | null;
  datePrecision: string;
  _count: {
    mediaItems: number;
    participants: number;
    setSessionLinks: number;
  };
};

type SessionMergeDialogProps = {
  survivingSessionId: string;
  survivingSessionName: string;
};

export function SessionMergeDialog({ survivingSessionId, survivingSessionName }: SessionMergeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "confirm">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [merging, setMerging] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchSessionsAction(query);
      setResults(res.filter((r) => r.id !== survivingSessionId));
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, survivingSessionId]);

  function handleSelect(result: SearchResult) {
    setSelected(result);
    setStep("confirm");
  }

  async function handleMerge() {
    if (!selected) return;
    setMerging(true);
    const result = await mergeSessions(survivingSessionId, selected.id);
    setMerging(false);

    if (result.success) {
      toast.success(`Merged "${selected.name}" into "${survivingSessionName}"`);
      setOpen(false);
      setStep("search");
      setQuery("");
      setSelected(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to merge sessions");
    }
  }

  function handleClose() {
    setOpen(false);
    setStep("search");
    setQuery("");
    setSelected(null);
    setResults([]);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Merge size={14} />
        Merge
      </Button>
      <DialogContent className="sm:max-w-lg">
        {step === "search" && (
          <>
            <DialogHeader>
              <DialogTitle>Merge with Another Session</DialogTitle>
              <DialogDescription>
                Search for a session to absorb into &ldquo;{survivingSessionName}&rdquo;. Media, participants, and set links will be transferred.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder="Search sessions..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {searching && (
                  <p className="text-sm text-muted-foreground py-2 text-center">Searching...</p>
                )}
                {!searching && query.trim() && results.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2 text-center">No sessions found.</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <SessionStatusBadge status={r.status} />
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{r._count.mediaItems} media</span>
                      <span>{r._count.participants} participants</span>
                      <span>{r._count.setSessionLinks} sets</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === "confirm" && selected && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Merge</DialogTitle>
              <DialogDescription>
                This action cannot be undone. The absorbed session will be soft-deleted.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center gap-3">
                <div className="rounded-lg border border-white/20 bg-card/60 px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Absorb</p>
                  <p className="text-sm font-medium">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected._count.mediaItems} media, {selected._count.participants} participants
                  </p>
                </div>
                <ArrowRight size={20} className="text-muted-foreground shrink-0" />
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center">
                  <p className="text-xs text-primary mb-0.5">Surviving</p>
                  <p className="text-sm font-medium">{survivingSessionName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  All media, participants, and set links from &ldquo;{selected.name}&rdquo; will be moved to &ldquo;{survivingSessionName}&rdquo;. The absorbed session will be permanently archived.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("search")} disabled={merging}>
                Back
              </Button>
              <Button onClick={handleMerge} disabled={merging} variant="destructive">
                {merging ? "Merging..." : "Confirm Merge"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
