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
  getSuggestedArtistsAction,
  createAliasFromCreditAction,
} from "@/lib/actions/set-actions";
import { CreatePersonSheet } from "@/components/people/create-person-sheet";
import { CreateArtistSheet } from "@/components/artists/create-artist-sheet";
import { contributorKindForRoleGroup } from "@/lib/services/session-contributors";
import { resolveCreditedAs } from "@/lib/sets/credited-as";
import { CreditAliasPicker } from "@/components/sets/credit-alias-picker";

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
  roleGroupName: string | null;
  rawName: string;
  resolutionStatus: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolvedAlias: { id: string; name: string } | null;
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
  source: "alias_channel" | "previous" | "channel";
};

type ArtistSuggestionItem = {
  id: string;
  name: string;
  nationality: string | null;
  sim: number;
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
  const [artistSuggestions, setArtistSuggestions] = useState<ArtistSuggestionItem[]>([]);
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

  // Pending alias creation prompt (shown after a resolve when rawName is novel)
  const [pendingAliasSuggestion, setPendingAliasSuggestion] = useState<{
    creditId: string;
    rawName: string;
    personId: string;
    personName: string;
  } | null>(null);

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
      if (result.suggestNewAlias && result.rawName) {
        setPendingAliasSuggestion({ creditId, rawName: result.rawName, personId, personName });
      }
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

  async function handleAddAlias(creditId: string, rawName: string, personId: string, channelId: string | null | undefined) {
    const result = await createAliasFromCreditAction(creditId, personId, rawName, channelId ?? null, setId);
    if (result.success) {
      setPendingAliasSuggestion(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to create alias");
    }
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

    // Resolve kind is fixed by the credit's role group (ADR-0021):
    // On-Camera → Person, Behind-Camera → Artist. No user toggle.
    const credit = credits.find((c) => c.id === creditId);
    const defaultMode = contributorKindForRoleGroup(credit?.roleGroupName ?? "");
    setResolveMode(defaultMode);

    // Load suggestions based on mode
    if (credit && defaultMode === "person") {
      setLoadingSuggestions(true);
      setSuggestions([]);
      setArtistSuggestions([]);
      getSuggestionsAction(credit.rawName, channelId ?? null).then((result) => {
        setSuggestions(result);
        setLoadingSuggestions(false);
      });
    } else if (credit && defaultMode === "artist") {
      setLoadingSuggestions(true);
      setArtistSuggestions([]);
      setSuggestions([]);
      getSuggestedArtistsAction(credit.rawName).then((result) => {
        setArtistSuggestions(result);
        setLoadingSuggestions(false);
      });
    } else {
      setSuggestions([]);
      setArtistSuggestions([]);
    }
  }

  function cancelResolving() {
    setResolvingCreditId(null);
    setSearchQuery("");
    setSearchResults([]);
    setArtistSearchResults([]);
    setShowDropdown(false);
    setSuggestions([]);
    setArtistSuggestions([]);
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
              actionLoading={actionLoading}
              searchQuery={searchQuery}
              searchResults={searchResults}
              artistSearchResults={artistSearchResults}
              isSearching={isSearching}
              showDropdown={showDropdown && resolvingCreditId === credit.id}
              suggestions={resolvingCreditId === credit.id ? suggestions : []}
              artistSuggestions={resolvingCreditId === credit.id ? artistSuggestions : []}
              loadingSuggestions={resolvingCreditId === credit.id && loadingSuggestions}
              dropdownRef={resolvingCreditId === credit.id ? dropdownRef : undefined}
              pendingAliasSuggestion={
                pendingAliasSuggestion?.creditId === credit.id ? pendingAliasSuggestion : null
              }
              channelId={channelId}
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
              onAddAlias={(rawName, personId) => handleAddAlias(credit.id, rawName, personId, channelId)}
              onSkipAlias={() => setPendingAliasSuggestion(null)}
              setId={setId}
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
  actionLoading: string | null;
  searchQuery: string;
  searchResults: PersonResult[];
  artistSearchResults: ArtistResult[];
  isSearching: boolean;
  showDropdown: boolean;
  suggestions: SuggestionItem[];
  artistSuggestions: ArtistSuggestionItem[];
  loadingSuggestions: boolean;
  dropdownRef?: React.RefObject<HTMLDivElement | null>;
  pendingAliasSuggestion: { creditId: string; rawName: string; personId: string; personName: string } | null;
  channelId?: string | null;
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
  onAddAlias: (rawName: string, personId: string) => void;
  onSkipAlias: () => void;
  setId: string;
};

function CreditRow({
  credit,
  isResolving,
  resolveMode,
  actionLoading,
  searchQuery,
  searchResults,
  artistSearchResults,
  isSearching,
  showDropdown,
  suggestions,
  artistSuggestions,
  loadingSuggestions,
  dropdownRef,
  pendingAliasSuggestion,
  channelId,
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
  onAddAlias,
  onSkipAlias,
  setId,
}: CreditRowProps) {
  const isLoading = actionLoading === credit.id;
  const commonName = credit.resolvedPerson?.aliases?.find((a) => a.isCommon)?.name ?? null;
  const resolvedName = commonName ?? credit.resolvedPerson?.icgId ?? null;
  // "as X" evidence for an already-pinned credit (ADR-0024 precedence).
  const creditedAs = credit.resolvedPerson ? resolveCreditedAs(credit, commonName) : null;

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

      {/* Channel-aware "Credited as" picker (ADR-0024): suggests the person's
          aliases on this set's channel, lets you pick or add a new one. */}
      {credit.resolutionStatus === "RESOLVED" && credit.resolvedPerson && (
        <CreditAliasPicker
          creditId={credit.id}
          setId={setId}
          personId={credit.resolvedPerson.id}
          channelId={channelId ?? null}
          currentAliasId={credit.resolvedAlias?.id ?? null}
          creditedAs={creditedAs}
        />
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

      {/* Alias creation prompt — shown when rawName is not yet a known alias for the resolved person */}
      {pendingAliasSuggestion && (
        <div className="rounded-md border border-violet-500/20 bg-violet-500/8 px-3 py-2 flex items-start gap-2">
          <span className="text-violet-500 mt-0.5 shrink-0" aria-hidden="true">◆</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              <span className="font-semibold">&ldquo;{pendingAliasSuggestion.rawName}&rdquo;</span>
              {" "}is not yet an alias for{" "}
              <span className="font-semibold">{pendingAliasSuggestion.personName}</span>.
              {channelId ? " Add it as an alias on this channel?" : " Add it as an alias?"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/10 px-2"
              onClick={() => onAddAlias(pendingAliasSuggestion.rawName, pendingAliasSuggestion.personId)}
            >
              Add Alias
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={onSkipAlias}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {/* Inline resolve search */}
      {isResolving && (
        <div className="space-y-2 pt-1">
          {/* Resolve kind is fixed by the credit's role group (ADR-0021) */}
          <div className="text-xs text-muted-foreground">
            Resolving as {resolveMode === "artist" ? "Artist (behind camera)" : "Person (on camera)"}
          </div>

          {/* Suggestion pills */}
          {loadingSuggestions && (
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
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                      s.source === "alias_channel"
                        ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    {s.commonAlias ?? s.icgId}
                    <span className="opacity-60 text-[10px]">
                      {s.source === "alias_channel" ? "known alias" : s.source === "previous" ? "prev" : "ch"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {resolveMode === "artist" && !loadingSuggestions && artistSuggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggested</p>
              <div className="flex flex-wrap gap-1.5">
                {artistSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onResolveAsArtist(s.id, s.name)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    {s.name}
                    {s.nationality && (
                      <span className="opacity-50 text-[10px]">{s.nationality}</span>
                    )}
                    <span className="opacity-40 text-[10px]">{Math.round(s.sim * 100)}%</span>
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
