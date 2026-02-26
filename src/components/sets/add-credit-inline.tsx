"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserSearch, Loader2, X, UserPlus, Camera, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSetCredits, searchPersonsAction } from "@/lib/actions/set-actions";
import { createMinimalPerson } from "@/lib/actions/person-actions";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
};

type AddCreditInlineProps = {
  setId: string;
};

const ROLE_CONFIG = {
  MODEL: {
    label: "Model",
    icon: <User size={14} />,
    badge: "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  PHOTOGRAPHER: {
    label: "Photographer",
    icon: <Camera size={14} />,
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
} as const;

export function AddCreditInline({ setId }: AddCreditInlineProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeRole, setActiveRole] = useState<"MODEL" | "PHOTOGRAPHER">("MODEL");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New person form
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [newIcgId, setNewIcgId] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);

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
    setShowDropdown(false);
    setShowNewPersonForm(false);
    setNewIcgId("");
    setNewName("");
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

  async function addCredit(rawName: string, resolvedPersonId?: string) {
    setIsSaving(true);
    const result = await saveSetCredits(setId, [
      { role: activeRole, rawName, resolvedPersonId },
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
      role: activeRole,
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
    setIsCreatingPerson(false);
    setShowNewPersonForm(false);
    setNewIcgId("");
    setNewName("");
    await addCredit(newName.trim(), result.id);
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

      {/* Search */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <UserSearch
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder="Search person, or type raw name + Enter…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
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
                setShowDropdown(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {showDropdown && searchResults.length > 0 && (
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

      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Saving…
        </div>
      )}

      {/* New person form */}
      {!showNewPersonForm && (
        <button
          type="button"
          onClick={() => setShowNewPersonForm(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserPlus size={12} />
          Create new person
        </button>
      )}

      {showNewPersonForm && (
        <div className="space-y-2 rounded-md border border-white/10 bg-muted/20 p-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="ICG-ID"
              value={newIcgId}
              onChange={(e) => setNewIcgId(e.target.value.toUpperCase())}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Display name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreateAndAdd}
              disabled={isCreatingPerson}
            >
              {isCreatingPerson ? <Loader2 size={12} className="animate-spin" /> : "Create & Add"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowNewPersonForm(false);
                setNewIcgId("");
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: paste comma-separated names and press Enter to bulk-add
      </p>
    </div>
  );
}
