"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, UserSearch, Loader2, Camera, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SheetFooter } from "@/components/ui/sheet";
import { saveSetCredits, searchPersonsAction } from "@/lib/actions/set-actions";
import { createMinimalPerson } from "@/lib/actions/person-actions";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
};

type CreditItem = {
  tempId: string;
  role: "MODEL" | "PHOTOGRAPHER";
  rawName: string;
  resolvedPersonId?: string;
  resolvedPersonName?: string;
};

type CreditEntryStepProps = {
  setId: string;
  onClose: () => void;
};

const ROLE_CONFIG = {
  MODEL: {
    label: "Models",
    icon: <User size={14} />,
    badge: "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  PHOTOGRAPHER: {
    label: "Photographer",
    icon: <Camera size={14} />,
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
} as const;

export function CreditEntryStep({ setId, onClose }: CreditEntryStepProps) {
  const router = useRouter();

  // Role tab
  const [activeRole, setActiveRole] = useState<"MODEL" | "PHOTOGRAPHER">("MODEL");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // New person form
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [newIcgId, setNewIcgId] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);

  // Credits list
  const [credits, setCredits] = useState<CreditItem[]>([]);

  // Footer state
  const [isSaving, setIsSaving] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const nextTempId = useRef(0);

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

  function addResolvedCredit(person: PersonResult) {
    const displayName = person.commonAlias ?? person.icgId;
    // Check if already added for same role
    if (credits.some((c) => c.resolvedPersonId === person.id && c.role === activeRole)) {
      toast.error("Person already added for this role");
      return;
    }
    setCredits([
      ...credits,
      {
        tempId: String(nextTempId.current++),
        role: activeRole,
        rawName: displayName,
        resolvedPersonId: person.id,
        resolvedPersonName: displayName,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  }

  function addUnresolvedCredit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCredits([
      ...credits,
      {
        tempId: String(nextTempId.current++),
        role: activeRole,
        rawName: trimmed,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      // If comma-separated, bulk add as unresolved
      if (q.includes(",")) {
        const names = q.split(",").map((n) => n.trim()).filter(Boolean);
        const newCredits: CreditItem[] = names.map((name) => ({
          tempId: String(nextTempId.current++),
          role: activeRole,
          rawName: name,
        }));
        setCredits([...credits, ...newCredits]);
        setSearchQuery("");
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      // Otherwise, add as single unresolved credit
      addUnresolvedCredit(q);
    }
  }

  function removeCredit(tempId: string) {
    setCredits(credits.filter((c) => c.tempId !== tempId));
  }

  async function handleCreateAndAdd() {
    if (!newIcgId.trim() || !newName.trim()) {
      toast.error("ICG-ID and display name are required");
      return;
    }
    setIsCreatingPerson(true);
    const result = await createMinimalPerson({ icgId: newIcgId.trim(), commonName: newName.trim() });
    if (!result.success) {
      toast.error(result.error);
      setIsCreatingPerson(false);
      return;
    }
    setCredits([
      ...credits,
      {
        tempId: String(nextTempId.current++),
        role: activeRole,
        rawName: newName.trim(),
        resolvedPersonId: result.id,
        resolvedPersonName: newName.trim(),
      },
    ]);
    setNewIcgId("");
    setNewName("");
    setShowNewPersonForm(false);
    setIsCreatingPerson(false);
    toast.success("Person created and added");
  }

  async function handleDone() {
    setIsSaving(true);
    if (credits.length > 0) {
      const result = await saveSetCredits(
        setId,
        credits.map((c) => ({
          role: c.role,
          rawName: c.rawName,
          resolvedPersonId: c.resolvedPersonId,
        })),
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to save credits");
        setIsSaving(false);
        return;
      }
    }
    router.push(`/sets/${setId}`);
    onClose();
  }

  function handleSkip() {
    router.push(`/sets/${setId}`);
    onClose();
  }

  const modelCredits = credits.filter((c) => c.role === "MODEL");
  const photographerCredits = credits.filter((c) => c.role === "PHOTOGRAPHER");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">

          {/* Role tabs */}
          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
            {(["MODEL", "PHOTOGRAPHER"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setActiveRole(role)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeRole === role
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {ROLE_CONFIG[role].icon}
                {ROLE_CONFIG[role].label}
              </button>
            ))}
          </div>

          {/* Search section */}
          <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-4 w-0.5 rounded-full bg-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Search or type name
              </h3>
            </div>

            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <UserSearch
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  placeholder="Search person, or type raw name and press Enter…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  className="pl-8 pr-8"
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
                      setShowDropdown(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Results dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {searchResults.map((person) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => addResolvedCredit(person)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors"
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

              {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  No results — press Enter to add as raw name
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Tip: paste comma-separated names and press Enter to bulk-add
            </p>
          </section>

          {/* New person form */}
          <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowNewPersonForm((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <UserPlus size={15} />
              {showNewPersonForm ? "Cancel new person" : "Create new person…"}
            </button>

            {showNewPersonForm && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground/80">
                      ICG-ID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. JD-96ABF"
                      value={newIcgId}
                      onChange={(e) => setNewIcgId(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground/80">
                      Display Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="Display name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateAndAdd}
                  disabled={isCreatingPerson}
                >
                  {isCreatingPerson ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Create & Add"
                  )}
                </Button>
              </div>
            )}
          </section>

          {/* Credits list */}
          {credits.length > 0 && (
            <section className="space-y-4">
              {modelCredits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Models ({modelCredits.length})
                  </p>
                  <CreditList credits={modelCredits} onRemove={removeCredit} />
                </div>
              )}
              {photographerCredits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Photographer ({photographerCredits.length})
                  </p>
                  <CreditList credits={photographerCredits} onRemove={removeCredit} />
                </div>
              )}
            </section>
          )}

          {credits.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No credits added yet. Search above or skip to finish.
            </p>
          )}
        </div>
      </div>

      <SheetFooter className="border-t px-4 py-4">
        <Button type="button" variant="outline" onClick={handleSkip} disabled={isSaving}>
          Skip
        </Button>
        <Button type="button" onClick={handleDone} disabled={isSaving}>
          {isSaving ? (
            <Loader2 size={14} className="animate-spin mr-1" />
          ) : null}
          {isSaving ? "Saving…" : credits.length > 0 ? "Done" : "Finish"}
        </Button>
      </SheetFooter>
    </div>
  );
}

// ── Credit list sub-component ────────────────────────────────────────────────

type CreditListProps = {
  credits: CreditItem[];
  onRemove: (tempId: string) => void;
};

function CreditList({ credits, onRemove }: CreditListProps) {
  return (
    <ul className="space-y-1.5">
      {credits.map((c) => (
        <li
          key={c.tempId}
          className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/60 px-3 py-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{c.rawName}</span>
            {c.resolvedPersonId ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
              >
                Resolved
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
              >
                Unresolved
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(c.tempId)}
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            aria-label={`Remove ${c.rawName}`}
          >
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
