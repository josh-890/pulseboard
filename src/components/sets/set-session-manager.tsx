"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clapperboard, Plus, Search, X, Layers } from "lucide-react";
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
import { searchSessionsAction, linkSessionAction, unlinkSessionAction } from "@/lib/actions/session-actions";
import type { SessionStatus } from "@/lib/types";

type SessionLink = {
  setId: string;
  sessionId: string;
  isPrimary: boolean;
  session: {
    id: string;
    name: string;
    status: SessionStatus;
    date: Date | null;
    datePrecision: string;
  };
};

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

type SetSessionManagerProps = {
  setId: string;
  sessionLinks: SessionLink[];
};

export function SetSessionManager({ setId, sessionLinks }: SetSessionManagerProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCompilation = sessionLinks.length > 1;
  const linkedSessionIds = new Set(sessionLinks.map((l) => l.sessionId));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchSessionsAction(query);
      // Exclude already linked sessions
      setResults(res.filter((r) => !linkedSessionIds.has(r.id)));
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleLink(sessionId: string) {
    setLinking(true);
    const result = await linkSessionAction(setId, sessionId);
    setLinking(false);

    if (result.success) {
      toast.success("Source session linked");
      setDialogOpen(false);
      setQuery("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to link session");
    }
  }

  async function handleUnlink(sessionId: string) {
    const result = await unlinkSessionAction(setId, sessionId);
    if (result.success) {
      toast.success("Session unlinked");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to unlink session");
    }
  }

  return (
    <div>
      {/* Compilation indicator */}
      {isCompilation && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Layers size={12} />
          Compilation
        </div>
      )}

      {/* Session badges */}
      <div className="flex flex-wrap items-center gap-2">
        {sessionLinks.map((link) => (
          <div
            key={link.sessionId}
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 pl-1 pr-2 py-0.5 text-sm"
          >
            <Clapperboard size={12} className="text-muted-foreground" />
            <Link
              href={`/sessions/${link.session.id}`}
              className="font-medium hover:text-primary transition-colors"
            >
              {link.session.name}
            </Link>
            <SessionStatusBadge status={link.session.status} className="text-[10px] px-1.5 py-0" />
            {link.isPrimary && (
              <span className="text-[10px] font-medium text-primary">Primary</span>
            )}
            {!link.isPrimary && (
              <button
                type="button"
                onClick={() => handleUnlink(link.sessionId)}
                className="opacity-0 group-hover:opacity-100 ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="Remove source session"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={12} />
          Add Source Session
        </Button>
      </div>

      {/* Search dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Source Session</DialogTitle>
            <DialogDescription>
              Link an additional session to mark this set as a compilation.
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
                  onClick={() => handleLink(r.id)}
                  disabled={linking}
                  className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
