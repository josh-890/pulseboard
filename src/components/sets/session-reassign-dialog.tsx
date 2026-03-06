"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SessionStatusBadge } from "@/components/sessions/session-status-badge";
import { searchSessionsAction } from "@/lib/actions/session-actions";
import { reassignSetSessionAction } from "@/lib/actions/set-actions";
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

type SessionReassignDialogProps = {
  setId: string;
  primarySessionId: string;
  primarySessionName: string;
  mediaCount: number;
  excludeSessionIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SessionReassignDialog({
  setId,
  primarySessionId,
  primarySessionName,
  mediaCount,
  excludeSessionIds,
  open,
  onOpenChange,
}: SessionReassignDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeSet = new Set([primarySessionId, ...excludeSessionIds]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchSessionsAction(query);
      setResults(res.filter((r) => !excludeSet.has(r.id)));
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  async function handleReassign() {
    if (!selected) return;
    setReassigning(true);
    const result = await reassignSetSessionAction(setId, selected.id);
    setReassigning(false);

    if (result.success) {
      toast.success(`Session reassigned to "${selected.name}"`);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to reassign session");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Primary Session</DialogTitle>
          <DialogDescription>
            Merge the auto-created session into an existing session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
            <div className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  This will merge &ldquo;{primarySessionName}&rdquo; into the selected session
                </p>
                <p className="mt-1 text-muted-foreground">
                  {mediaCount} media item{mediaCount !== 1 ? "s" : ""} will be reassigned
                  and the auto-created session will be deleted.
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          {!selected ? (
            <>
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
              <div className="max-h-48 overflow-y-auto space-y-1">
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
                    onClick={() => setSelected(r)}
                    className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <SessionStatusBadge status={r.status} />
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{r._count.mediaItems} media</span>
                      <span>{r._count.participants} participants</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Confirmation */
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-1 rounded-lg border border-white/10 bg-muted/40 p-2.5 text-center">
                  <p className="font-medium">{primarySessionName}</p>
                  <p className="text-xs text-muted-foreground">Auto-created</p>
                </div>
                <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
                <div className="flex-1 rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-center">
                  <p className="font-medium">{selected.name}</p>
                  <div className="mt-0.5 flex justify-center">
                    <SessionStatusBadge status={selected.status} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelected(null)}
                >
                  Change
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={reassigning}
                  onClick={handleReassign}
                >
                  {reassigning ? (
                    <Loader2 size={14} className="animate-spin mr-1" />
                  ) : null}
                  Confirm Reassign
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
