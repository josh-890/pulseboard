"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserSearch, Loader2, X, UserPlus, Check, Ban, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  resolveCredit,
  ignoreCredit,
  unresolveCredit,
  searchPersonsAction,
  getSuggestionsAction,
} from "@/lib/actions/set-actions";
import { CreatePersonSheet } from "@/components/people/create-person-sheet";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
};

type CreditRawItem = {
  id: string;
  roleDefinitionId: string;
  roleName: string;
  rawName: string;
  resolutionStatus: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolvedPerson: {
    id: string;
    icgId: string;
    aliases: { name: string; type: string }[];
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

  // Track which credit is being resolved inline
  const [resolvingCreditId, setResolvingCreditId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create person sheet
  const [showCreateSheet, setShowCreateSheet] = useState(false);

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
      setShowDropdown(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchPersonsAction(q);
      setSearchResults(results);
      setShowDropdown(true);
      setIsSearching(false);
    }, 300);
  }

  async function handleResolve(creditId: string, personId: string, personName: string) {
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
                  icgId: "",
                  aliases: [{ name: personName, type: "common" }],
                },
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
            ? { ...c, resolutionStatus: "UNRESOLVED" as const, resolvedPerson: null }
            : c,
        ),
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to undo");
    }
    setActionLoading(null);
  }

  async function handlePersonCreated(person: { id: string; name: string }) {
    if (resolvingCreditId) {
      await handleResolve(resolvingCreditId, person.id, person.name);
    }
    setShowCreateSheet(false);
  }

  function startResolving(creditId: string) {
    setResolvingCreditId(creditId);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);

    // Load suggestions for this credit
    const credit = credits.find((c) => c.id === creditId);
    if (credit) {
      setLoadingSuggestions(true);
      setSuggestions([]);
      getSuggestionsAction(credit.rawName, channelId ?? null).then((result) => {
        setSuggestions(result);
        setLoadingSuggestions(false);
      });
    }
  }

  function cancelResolving() {
    setResolvingCreditId(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setSuggestions([]);
  }

  // Group by role definition
  const creditsByRole = new Map<string, { roleName: string; items: typeof credits }>();
  for (const c of credits) {
    const existing = creditsByRole.get(c.roleDefinitionId);
    if (existing) {
      existing.items.push(c);
    } else {
      creditsByRole.set(c.roleDefinitionId, { roleName: c.roleName, items: [c] });
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
              actionLoading={actionLoading}
              searchQuery={searchQuery}
              searchResults={searchResults}
              isSearching={isSearching}
              showDropdown={showDropdown && resolvingCreditId === credit.id}
              suggestions={resolvingCreditId === credit.id ? suggestions : []}
              loadingSuggestions={resolvingCreditId === credit.id && loadingSuggestions}
              dropdownRef={resolvingCreditId === credit.id ? dropdownRef : undefined}
              onStartResolving={() => startResolving(credit.id)}
              onCancelResolving={cancelResolving}
              onSearchChange={handleSearchChange}
              onResolve={(personId, personName) => handleResolve(credit.id, personId, personName)}
              onIgnore={() => handleIgnore(credit.id)}
              onUnresolve={() => handleUnresolve(credit.id)}
              onShowCreateSheet={() => setShowCreateSheet(true)}
            />
          ))}
        </div>
      ))}

      <CreatePersonSheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        onCreated={handlePersonCreated}
      />
    </div>
  );
}

// ── CreditRow ────────────────────────────────────────────────────────────────

type CreditRowProps = {
  credit: CreditRawItem;
  isResolving: boolean;
  actionLoading: string | null;
  searchQuery: string;
  searchResults: PersonResult[];
  isSearching: boolean;
  showDropdown: boolean;
  suggestions: SuggestionItem[];
  loadingSuggestions: boolean;
  dropdownRef?: React.RefObject<HTMLDivElement | null>;
  onStartResolving: () => void;
  onCancelResolving: () => void;
  onSearchChange: (q: string) => void;
  onResolve: (personId: string, personName: string) => void;
  onIgnore: () => void;
  onUnresolve: () => void;
  onShowCreateSheet: () => void;
};

function CreditRow({
  credit,
  isResolving,
  actionLoading,
  searchQuery,
  searchResults,
  isSearching,
  showDropdown,
  suggestions,
  loadingSuggestions,
  dropdownRef,
  onStartResolving,
  onCancelResolving,
  onSearchChange,
  onResolve,
  onIgnore,
  onUnresolve,
  onShowCreateSheet,
}: CreditRowProps) {
  const isLoading = actionLoading === credit.id;
  const resolvedName =
    credit.resolvedPerson?.aliases?.find((a) => a.type === "common")?.name ??
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
            </>
          )}
          {!isLoading && credit.resolutionStatus === "IGNORED" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onUnresolve}
            >
              <Undo2 size={12} className="mr-1" /> Undo
            </Button>
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
        </div>
      )}

      {/* Inline resolve search */}
      {isResolving && (
        <div className="space-y-2 pt-1">
          {/* Suggestion pills */}
          {loadingSuggestions && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={10} className="animate-spin" />
              Loading suggestions…
            </div>
          )}
          {!loadingSuggestions && suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggested</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onResolve(s.id, s.commonAlias ?? s.icgId)}
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
                placeholder="Search person…"
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

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
                <ul className="max-h-36 overflow-y-auto py-1">
                  {searchResults.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() =>
                          onResolve(person.id, person.commonAlias ?? person.icgId)
                        }
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left transition-colors"
                      >
                        <span className="font-medium">
                          {person.commonAlias ?? person.icgId}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {person.icgId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onShowCreateSheet}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <UserPlus size={12} />
            Create new person
          </button>

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
