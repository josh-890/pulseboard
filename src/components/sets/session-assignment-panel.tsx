"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, X, Plus, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  assignSession,
  unlinkSession,
  searchSessionsAction,
  createNewSession,
} from "@/lib/actions/set-actions";

type SessionInfo = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
};

type SessionAssignmentPanelProps = {
  setId: string;
  currentSession: {
    id: string;
    name: string;
    project: { id: string; name: string } | null;
  } | null;
  hasParticipants: boolean;
};

type Mode = "view" | "search" | "create";

export function SessionAssignmentPanel({
  setId,
  currentSession,
  hasParticipants,
}: SessionAssignmentPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [isLoading, setIsLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SessionInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copyParticipants, setCopyParticipants] = useState(false);

  // Create state
  const [newSessionName, setNewSessionName] = useState("");

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchSessionsAction(q);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
  }

  async function handleAssign(sessionId: string) {
    setIsLoading(true);
    const result = await assignSession(setId, sessionId, copyParticipants);
    if (result.success) {
      toast.success("Session assigned");
      setMode("view");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to assign session");
    }
    setIsLoading(false);
  }

  async function handleUnlink() {
    setIsLoading(true);
    const result = await unlinkSession(setId);
    if (result.success) {
      toast.success("Session unlinked");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to unlink session");
    }
    setIsLoading(false);
  }

  async function handleCreate() {
    if (!newSessionName.trim()) {
      toast.error("Session name is required");
      return;
    }
    setIsLoading(true);
    const result = await createNewSession({ name: newSessionName.trim() });
    if (!result.success) {
      toast.error(result.error);
      setIsLoading(false);
      return;
    }
    // Auto-assign the new session
    const assignResult = await assignSession(setId, result.id, copyParticipants);
    if (assignResult.success) {
      toast.success("Session created and assigned");
      setMode("view");
      router.refresh();
    } else {
      toast.error(assignResult.error ?? "Failed to assign new session");
    }
    setIsLoading(false);
  }

  function resetMode() {
    setMode("view");
    setSearchQuery("");
    setSearchResults([]);
    setNewSessionName("");
    setCopyParticipants(false);
  }

  // View mode — show current session or "no session"
  if (mode === "view") {
    if (currentSession) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Link2 size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Session:</span>
            <span className="font-medium">{currentSession.name}</span>
            {currentSession.project && (
              <>
                <span className="text-muted-foreground">·</span>
                <Link
                  href={`/projects/${currentSession.project.id}`}
                  className="text-primary hover:underline underline-offset-2 text-sm"
                >
                  {currentSession.project.name}
                </Link>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode("search")}
              disabled={isLoading}
            >
              Change
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={handleUnlink}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : <Unlink size={12} className="mr-1" />}
              Unlink
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No session assigned</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("search")}
          >
            <Search size={12} className="mr-1" /> Assign Session
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("create")}
          >
            <Plus size={12} className="mr-1" /> Create Session
          </Button>
        </div>
      </div>
    );
  }

  // Search mode
  if (mode === "search") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Find session
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={resetMode}
          >
            <X size={12} className="mr-1" /> Cancel
          </Button>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder="Search sessions…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
            autoFocus
          />
          {isSearching && (
            <Loader2
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>

        {searchResults.length > 0 && (
          <ul className="max-h-40 overflow-y-auto space-y-1">
            {searchResults.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => handleAssign(session.id)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors disabled:opacity-50"
                >
                  <span className="font-medium truncate">{session.name}</span>
                  {session.projectName && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {session.projectName}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasParticipants && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={copyParticipants}
              onCheckedChange={(v) => setCopyParticipants(v === true)}
            />
            Copy resolved participants to session
          </label>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setMode("create")}
        >
          <Plus size={12} className="mr-1" /> Create new session instead
        </Button>
      </div>
    );
  }

  // Create mode
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Create session
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={resetMode}
        >
          <X size={12} className="mr-1" /> Cancel
        </Button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground/80">
          Session name <span className="text-destructive">*</span>
        </label>
        <Input
          placeholder="Session name"
          value={newSessionName}
          onChange={(e) => setNewSessionName(e.target.value)}
          className="h-8 text-sm"
          autoFocus
        />
      </div>

      {hasParticipants && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={copyParticipants}
            onCheckedChange={(v) => setCopyParticipants(v === true)}
          />
          Copy resolved participants to session
        </label>
      )}

      <Button
        size="sm"
        className="h-7 text-xs"
        onClick={handleCreate}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
        Create & Assign
      </Button>
    </div>
  );
}
