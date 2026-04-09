"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserSearch, Loader2, X, UserPlus, Check, Ban, Undo2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  resolveCredit,
  resolveCreditAsArtist,
  ignoreCredit,
  unresolveCredit,
  deleteCredit,
  searchPersonsAction,
  searchArtistsAction,
  getSuggestionsAction,
} from "@/lib/actions/set-actions";
import { CreatePersonSheet } from "@/components/people/create-person-sheet";
import { CreateArtistSheet } from "@/components/artists/create-artist-sheet";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
  matchedAlias: string | null;
};

type ArtistResult = {
  id: string;
  name: string;
  nationality: string | null;
};

type CreditRawItem = {
  id: string;
  roleDefinitionId: string | null;
  roleName: string | null;
  rawName: string;
  resolutionStatus: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolvedPerson: {
    id: string;
    icgId: string;
    aliases: { name: string; isCommon: boolean }[];
  } | null;
  resolvedArtist: {
    id: string;
    name: string;
  } | null;
};

type SuggestionItem = {
  id: string;
  icgId: string;
  commonAlias: string | null;
  source: "previous" | "channel";
};

type CreditResolutionPanelProps = {
  setId: string;
  credits: CreditRawItem[];
  channelId?: string | null;
};

export function CreditResolutionPanel({ setId, credits: initialCredits, channelId }: CreditResolutionPanelProps) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);

  // Re-sync when server data changes (e.g. after router.refresh())
  useEffect(() => {
    setCredits(initialCredits);
  }, [initialCredits]);

  // Track which credit is being resolved inline
  const [resolvingCreditId, setResolvingCreditId] = useState<string | null>(null);
  const [resolveMode, setResolveMode] = useState<"person" | "artist">("person");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [artistSearchResults, setArtistSearchResults] = useState<ArtistResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create sheets
  const [showCreatePersonSheet, setShowCreatePersonSheet] = useState(false);
  const [showCreateArtistSheet, setShowCreateArtistSheet] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      setArtistSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      if (resolveMode === "artist") {
        const results = await searchArtistsAction(q);
        setArtistSearchResults(results);
        setSearchResults([]);
      } else {
        const results = await searchPersonsAction(q);
        setSearchResults(results);
        setArtistSearchResults([]);
      }
      setShowDropdown(true);
      setIsSearching(false);
    }, 300);
  }

  async function handleResolve(creditId: string, personId: string, personName: string, icgId: string) {
    setActionLoading(creditId);
    const result = await resolveCredit(creditId, personId, setId);
    if (result.success) {
      setCredits((prev) =>
        prev.map((c) =>
          c.id === creditId
            ? {
                ...c,
                resolutionStatus: "RESOLVED" as const,
                resolvedPerson: {
                  id: personId,
                  icgId,
                  aliases: [{ name: personName, isCommon: true }],
                },
                resolvedArtist: null,
              }
            : c,
        ),
      );
      setResolvingCreditId(null);
      setSearchQuery("");
      setSearchResults([]);
      setShowDropdown(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to resolve");
    }
    setActionLoading(null);
  }

  async function handleResolveAsArtist(creditId: string, artistId: string, artistName: string) {
    setActionLoading(creditId);
    const result = await resolveCreditAsArtist(creditId, artistId, setId);
    if (result.success) {
      setCredits((prev) =>
        prev.map((c) =>
          c.id === creditId
            ? {
                ...c,
                resolutionStatus: "RESOLVED" as const,
                resolvedPerson: null,
                resolvedArtist: { id: artistId, name: artistName },
              }
            : c,
        ),
      );
      setResolvingCreditId(null);
      setSearchQuery("");
      setArtistSearchResults([]);
      setShowDropdown(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to resolve as artist");
    }
    setActionLoading(null);
  }

  async function handleIgnore(creditId: string) {
    setActionLoading(creditId);
    const result = await ignoreCredit(creditId, setId);
    if (result.success) {
      setCredits((prev) =>
        prev.map((c) => (c.id === creditId ? { ...c, resolutionStatus: "IGNORED" as const } : c)),
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to ignore");
    }
    setActionLoading(null);
  }

  async function handleUnresolve(creditId: string) {
    setActionLoading(creditId);
    const result = await unresolveCredit(creditId, setId);
    if (result.success) {
      setCredits((prev) =>
        prev.map((c) =>
          c.id === creditId
            ? { ...c, resolutionStatus: "UNRESOLVED" as const, resolvedPerson: null, resolvedArtist: null }
            : c,
        ),
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to undo");
    }
    setActionLoading(null);
  }

  async function handleDelete(creditId: string) {
    setActionLoading(creditId);
    const result = await deleteCredit(creditId, setId);
    if (result.success) {
      setCredits((prev) => prev.filter((c) => c.id !== creditId));
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to delete credit");
    }
    setActionLoading(null);
  }

  async function handlePersonCreated(person: { id: string; name: string }) {
    if (resolvingCreditId) {
      await handleResolve(resolvingCreditId, person.id, person.name, "");
    }
    setShowCreatePersonSheet(false);
  }

  async function handleArtistCreated(artist: { id: string; name: string }) {
    if (resolvingCreditId) {
      await handleResolveAsArtist(resolvingCreditId, artist.id, artist.name);
    }
    setShowCreateArtistSheet(false);
  }

  function startResolving(creditId: string) {
    setResolvingCreditId(creditId);
    setSearchQuery("");
    setSearchResults([]);
    setArtistSearchResults([]);
    setShowDropdown(false);

    // Default mode: credits with no role → artist, credits with role → person
    const credit = credits.find((c) => c.id === creditId);
    const defaultMode = credit?.roleDefinitionId ? "person" : "artist";
    setResolveMode(defaultMode);

    // Load suggestions for person mode
    if (credit && defaultMode === "person") {
      setLoadingSuggestions(true);
      setSuggestions([]);
      getSuggestionsAction(credit.rawName, channelId ?? null).then((result) => {
        setSuggestions(result);
        setLoadingSuggestions(false);
      });
    } else {
      setSuggestions([]);
    }
  }

  function cancelResolving() {
    setResolvingCreditId(null);
    setSearchQuery("");
    setSearchResults([]);
    setArtistSearchResults([]);
    setShowDropdown(false);
    setSuggestions([]);
  }

  // Group by role definition (null roleDefinitionId → "Other" group)
  const creditsByRole = new Map<string, { roleName: string; items: typeof credits }>();
  for (const c of credits) {
    const key = c.roleDefinitionId ?? "__none__";
    const existing = creditsByRole.get(key);
    if (existing) {
      existing.items.push(c);
    } else {
      creditsByRole.set(key, { roleName: c.roleName ?? "Artist", items: [c] });
    }
  }

  if (credits.length === 0) return null;

  return (
    <div className="space-y-4">
      {Array.from(creditsByRole.entries()).map(([roleDefId, { roleName, items }]) => (
        <div key={roleDefId} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            {roleName} ({items.length})
          </p>
          {items.map((credit) => (
            <CreditRow
              key={credit.id}
              credit={credit}
              isResolving={resolvingCreditId === credit.id}
              resolveMode={resolveMode}
              onResolveModeChange={setResolveMode}
              actionLoading={actionLoading}
              searchQuery={searchQuery}
              searchResults={searchResults}
              artistSearchResults={artistSearchResults}
              isSearching={isSearching}
              showDropdown={showDropdown && resolvingCreditId === credit.id}
              suggestions={resolvingCreditId === credit.id ? suggestions : []}
              loadingSuggestions={resolvingCreditId === credit.id && loadingSuggestions}
              dropdownRef={resolvingCreditId === credit.id ? dropdownRef : undefined}
              onStartResolving={() => startResolving(credit.id)}
              onCancelResolving={cancelResolving}
              onSearchChange={handleSearchChange}
              onResolve={(personId, personName, icgId) => handleResolve(credit.id, personId, personName, icgId)}
              onResolveAsArtist={(artistId, artistName) => handleResolveAsArtist(credit.id, artistId, artistName)}
              onIgnore={() => handleIgnore(credit.id)}
              onUnresolve={() => handleUnresolve(credit.id)}
              onDelete={() => handleDelete(credit.id)}
              onShowCreatePersonSheet={() => setShowCreatePersonSheet(true)}
              onShowCreateArtistSheet={() => setShowCreateArtistSheet(true)}
            />
          ))}
        </div>
      ))}

      <CreatePersonSheet
        open={showCreatePersonSheet}
        onOpenChange={setShowCreatePersonSheet}
        onCreated={handlePersonCreated}
      />
      <CreateArtistSheet
        open={showCreateArtistSheet}
        onOpenChange={setShowCreateArtistSheet}
        onCreated={handleArtistCreated}
      />
    </div>
  );
}

// ── CreditRow ────────────────────────────────────────────────────────────────

type CreditRowProps = {
  credit: CreditRawItem;
  isResolving: boolean;
  resolveMode: "person" | "artist";
  onResolveModeChange: (mode: "person" | "artist") => void;
  actionLoading: string | null;
  searchQuery: string;
  searchResults: PersonResult[];
  artistSearchResults: ArtistResult[];
  isSearching: boolean;
  showDropdown: boolean;
  suggestions: SuggestionItem[];
  loadingSuggestions: boolean;
  dropdownRef?: React.RefObject<HTMLDivElement | null>;
  onStartResolving: () => void;
  onCancelResolving: () => void;
  onSearchChange: (q: string) => void;
  onResolve: (personId: string, personName: string, icgId: string) => void;
  onResolveAsArtist: (artistId: string, artistName: string) => void;
  onIgnore: () => void;
  onUnresolve: () => void;
  onDelete: () => void;
  onShowCreatePersonSheet: () => void;
  onShowCreateArtistSheet: () => void;
};

function CreditRow({
  credit,
  isResolving,
  resolveMode,
  onResolveModeChange,
  actionLoading,
  searchQuery,
  searchResults,
  artistSearchResults,
  isSearching,
  showDropdown,
  suggestions,
  loadingSuggestions,
  dropdownRef,
  onStartResolving,
  onCancelResolving,
  onSearchChange,
  onResolve,
  onResolveAsArtist,
  onIgnore,
  onUnresolve,
  onDelete,
  onShowCreatePersonSheet,
  onShowCreateArtistSheet,
}: CreditRowProps) {
  const isLoading = actionLoading === credit.id;
  const resolvedName =
    credit.resolvedPerson?.aliases?.find((a) => a.isCommon)?.name ??
    credit.resolvedPerson?.icgId ??
    null;

  return (
    <div className="rounded-lg border border-white/15 bg-card/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{credit.rawName}</span>
          {credit.resolutionStatus === "UNRESOLVED" && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs shrink-0"
            >
              Unresolved
            </Badge>
          )}
          {credit.resolutionStatus === "RESOLVED" && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs shrink-0"
            >
              Resolved
            </Badge>
          )}
          {credit.resolutionStatus === "IGNORED" && (
            <Badge
              variant="outline"
              className="border-slate-500/30 bg-slate-500/10 text-slate-500 text-xs shrink-0"
            >
              Ignored
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          {!isLoading && credit.resolutionStatus === "UNRESOLVED" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onStartResolving}
              >
                <Check size={12} className="mr-1" /> Resolve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={onIgnore}
              >
                <Ban size={12} className="mr-1" /> Ignore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive/70 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 size={12} />
              </Button>
            </>
          )}
          {!isLoading && credit.resolutionStatus === "IGNORED" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onUnresolve}
              >
                <Undo2 size={12} className="mr-1" /> Undo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive/70 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 size={12} />
              </Button>
            </>
          )}
          {!isLoading && credit.resolutionStatus === "RESOLVED" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={onUnresolve}
            >
              <Undo2 size={12} className="mr-1" /> Unresolve
            </Button>
          )}
        </div>
      </div>

      {/* Resolved person link */}
      {credit.resolutionStatus === "RESOLVED" && credit.resolvedPerson && (
        <div className="pl-2 text-sm">
          <span className="text-muted-foreground">→ </span>
          <Link
            href={`/people/${credit.resolvedPerson.id}`}
            className="text-primary hover:underline underline-offset-2"
          >
            {resolvedName}
          </Link>
          <span className="ml-1.5 text-[10px] text-muted-foreground">({credit.resolvedPerson.icgId})</span>
        </div>
      )}

      {/* Resolved artist link */}
      {credit.resolutionStatus === "RESOLVED" && credit.resolvedArtist && (
        <div className="pl-2 text-sm">
          <span className="text-muted-foreground">→ </span>
          <Link
            href={`/artists/${credit.resolvedArtist.id}`}
            className="text-primary hover:underline underline-offset-2"
          >
            {credit.resolvedArtist.name}
          </Link>
          <span className="ml-1.5 text-[10px] text-muted-foreground">(artist)</span>
        </div>
      )}

      {/* Inline resolve search */}
      {isResolving && (
        <div className="space-y-2 pt-1">
          {/* Person / Artist mode toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onResolveModeChange("person"); onSearchChange(""); }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                resolveMode === "person"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Person
            </button>
            <button
              type="button"
              onClick={() => { onResolveModeChange("artist"); onSearchChange(""); }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                resolveMode === "artist"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Artist
            </button>
          </div>

          {/* Suggestion pills (person mode only) */}
          {resolveMode === "person" && loadingSuggestions && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={10} className="animate-spin" />
              Loading suggestions…
            </div>
          )}
          {resolveMode === "person" && !loadingSuggestions && suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggested</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onResolve(s.id, s.commonAlias ?? s.icgId, s.icgId)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    {s.commonAlias ?? s.icgId}
                    <span className="opacity-50 text-[10px]">
                      {s.source === "previous" ? "prev" : "ch"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <UserSearch
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                placeholder={resolveMode === "artist" ? "Search artist…" : "Search person…"}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
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

            {/* Person search results */}
            {resolveMode === "person" && showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
                <ul className="max-h-36 overflow-y-auto py-1">
                  {searchResults.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() =>
                          onResolve(person.id, person.commonAlias ?? person.icgId, person.icgId)
                        }
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left transition-colors"
                      >
                        <span className="font-medium">
                          {person.commonAlias ?? person.icgId}
                          {person.matchedAlias && (
                            <span className="font-normal text-muted-foreground"> (a.k.a.: {person.matchedAlias})</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({person.icgId})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Artist search results */}
            {resolveMode === "artist" && showDropdown && artistSearchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
                <ul className="max-h-36 overflow-y-auto py-1">
                  {artistSearchResults.map((artist) => (
                    <li key={artist.id}>
                      <button
                        type="button"
                        onClick={() => onResolveAsArtist(artist.id, artist.name)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left transition-colors"
                      >
                        <span className="font-medium">{artist.name}</span>
                        {artist.nationality && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {artist.nationality}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {resolveMode === "person" ? (
            <button
              type="button"
              onClick={onShowCreatePersonSheet}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <UserPlus size={12} />
              Create new person
            </button>
          ) : (
            <button
              type="button"
              onClick={onShowCreateArtistSheet}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <UserPlus size={12} />
              Create new artist
            </button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={onCancelResolving}
          >
            <X size={12} className="mr-1" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
