"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserSearch, Loader2, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSetCredits, searchPersonsAction, searchArtistsAction } from "@/lib/actions/set-actions";
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

type RoleDefinitionOption = {
  id: string;
  name: string;
  groupName: string;
};

type AddCreditInlineProps = {
  setId: string;
  roleDefinitions: RoleDefinitionOption[];
};

export function AddCreditInline({ setId, roleDefinitions }: AddCreditInlineProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeRoleId, setActiveRoleId] = useState<string>(roleDefinitions[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [artistSearchResults, setArtistSearchResults] = useState<ArtistResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Create sheets
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showCreateArtistSheet, setShowCreateArtistSheet] = useState(false);

  // Determine if active role is behind-camera (artist-type)
  const activeRole = roleDefinitions.find((rd) => rd.id === activeRoleId);
  const isArtistRole = activeRole?.groupName === "Behind Camera";

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

  function reset() {
    setSearchQuery("");
    setSearchResults([]);
    setArtistSearchResults([]);
    setShowDropdown(false);
    setShowCreateSheet(false);
    setShowCreateArtistSheet(false);
  }

  function handleClose() {
    setIsExpanded(false);
    reset();
  }

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
      if (isArtistRole) {
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

  async function addCredit(rawName: string, resolvedPersonId?: string, resolvedArtistId?: string) {
    setIsSaving(true);
    const result = await saveSetCredits(setId, [
      { roleDefinitionId: activeRoleId, rawName, resolvedPersonId, resolvedArtistId },
    ]);
    if (result.success) {
      toast.success("Credit added");
      reset();
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add credit");
    }
    setIsSaving(false);
  }

  function handleSelectPerson(person: PersonResult) {
    const displayName = person.commonAlias ?? person.icgId;
    addCredit(displayName, person.id);
  }

  function handleSelectArtist(artist: ArtistResult) {
    addCredit(artist.name, undefined, artist.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      // Comma-separated bulk add
      if (q.includes(",")) {
        const names = q.split(",").map((n) => n.trim()).filter(Boolean);
        addBulkCredits(names);
        return;
      }

      addCredit(q);
    }
  }

  async function addBulkCredits(names: string[]) {
    setIsSaving(true);
    const credits = names.map((name) => ({
      roleDefinitionId: activeRoleId,
      rawName: name,
    }));
    const result = await saveSetCredits(setId, credits);
    if (result.success) {
      toast.success(`${names.length} credits added`);
      reset();
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add credits");
    }
    setIsSaving(false);
  }

  async function handlePersonCreated(person: { id: string; name: string }) {
    setShowCreateSheet(false);
    await addCredit(person.name, person.id);
  }

  async function handleArtistCreated(artist: { id: string; name: string }) {
    setShowCreateArtistSheet(false);
    await addCredit(artist.name, undefined, artist.id);
  }

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setIsExpanded(true)}
      >
        <Plus size={14} />
        Add Credit
      </Button>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add Credit</p>
        <button
          type="button"
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {roleDefinitions.map((rd) => (
          <button
            key={rd.id}
            type="button"
            onClick={() => setActiveRoleId(rd.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeRoleId === rd.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {rd.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <UserSearch
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder={isArtistRole ? "Search artist, or type raw name + Enter…" : "Search person, or type raw name + Enter…"}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => (searchResults.length > 0 || artistSearchResults.length > 0) && setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            className="pl-8 pr-8"
            autoFocus
            disabled={isSaving}
          />
          {isSearching && (
            <Loader2
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
          {searchQuery && !isSearching && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setArtistSearchResults([]);
                setShowDropdown(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Person search results */}
        {!isArtistRole && showDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
            <ul className="max-h-48 overflow-y-auto py-1">
              {searchResults.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectPerson(person)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors"
                    disabled={isSaving}
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
        {isArtistRole && showDropdown && artistSearchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
            <ul className="max-h-48 overflow-y-auto py-1">
              {artistSearchResults.map((artist) => (
                <li key={artist.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectArtist(artist)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors"
                    disabled={isSaving}
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

        {showDropdown && searchResults.length === 0 && artistSearchResults.length === 0 && !isSearching && searchQuery.trim() && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground">
            No results — press Enter to add as raw name
          </div>
        )}
      </div>

      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Saving…
        </div>
      )}

      {isArtistRole ? (
        <button
          type="button"
          onClick={() => setShowCreateArtistSheet(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserPlus size={12} />
          Create new artist
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreateSheet(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserPlus size={12} />
          Create new person
        </button>
      )}

      <CreatePersonSheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        onCreated={handlePersonCreated}
      />
      <CreateArtistSheet
        open={showCreateArtistSheet}
        onOpenChange={setShowCreateArtistSheet}
        onCreated={handleArtistCreated}
      />

      <p className="text-xs text-muted-foreground">
        Tip: paste comma-separated names and press Enter to bulk-add
      </p>
    </div>
  );
}
