"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, UserSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetFooter } from "@/components/ui/sheet";
import { saveContributions, searchPersonsAction } from "@/lib/actions/set-actions";
import { createMinimalPerson } from "@/lib/actions/person-actions";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
};

type Contributor = {
  personId: string;
  displayName: string;
  icgId: string;
  role: "main" | "supporting" | "background";
};

const ROLE_LABELS: Record<Contributor["role"], string> = {
  main: "Main",
  supporting: "Supporting",
  background: "Background",
};

const ROLE_STYLES: Record<Contributor["role"], string> = {
  main: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  supporting: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  background: "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

type ContributorsStepProps = {
  setId: string;
  onClose: () => void;
};

export function ContributorsStep({ setId, onClose }: ContributorsStepProps) {
  const router = useRouter();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [pendingRole, setPendingRole] = useState<Contributor["role"]>("main");

  // New person form state
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [newIcgId, setNewIcgId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState<Contributor["role"]>("main");
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);

  // Contributors list
  const [contributors, setContributors] = useState<Contributor[]>([]);

  // Footer state
  const [isSaving, setIsSaving] = useState(false);

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
    setSelectedPerson(null);
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

  function selectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setSearchQuery(person.commonAlias ?? person.icgId);
    setShowDropdown(false);
    setSearchResults([]);
  }

  function addSelectedPerson() {
    if (!selectedPerson) return;
    if (contributors.some((c) => c.personId === selectedPerson.id)) {
      toast.error("Person already added");
      return;
    }
    setContributors([
      ...contributors,
      {
        personId: selectedPerson.id,
        displayName: selectedPerson.commonAlias ?? selectedPerson.icgId,
        icgId: selectedPerson.icgId,
        role: pendingRole,
      },
    ]);
    setSelectedPerson(null);
    setSearchQuery("");
    setPendingRole("main");
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
    setContributors([
      ...contributors,
      {
        personId: result.id,
        displayName: newName.trim(),
        icgId: newIcgId.trim(),
        role: newPersonRole,
      },
    ]);
    setNewIcgId("");
    setNewName("");
    setNewPersonRole("main");
    setShowNewPersonForm(false);
    setIsCreatingPerson(false);
    toast.success("Person created and added");
  }

  function removeContributor(personId: string) {
    setContributors(contributors.filter((c) => c.personId !== personId));
  }

  async function handleDone() {
    setIsSaving(true);
    if (contributors.length > 0) {
      const result = await saveContributions(setId, contributors);
      if (!result.success) {
        toast.error(result.error ?? "Failed to save contributors");
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

  const isAlreadyAdded = (id: string) => contributors.some((c) => c.personId === id);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          {/* Search section */}
          <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-4 w-0.5 rounded-full bg-primary" />
              <h3 className="text-sm font-semibold text-foreground">Search People</h3>
            </div>

            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <UserSearch
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  placeholder="Search by name or ICG-ID…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
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
                      setSelectedPerson(null);
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
                          onClick={() => selectPerson(person)}
                          disabled={isAlreadyAdded(person.id)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed text-left transition-colors"
                        >
                          <span className="font-medium">
                            {person.commonAlias ?? person.icgId}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {person.icgId}
                            {isAlreadyAdded(person.id) && " · added"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  No results for "{searchQuery}"
                </div>
              )}
            </div>

            {/* Role + Add row — shown when a person is selected */}
            {selectedPerson && (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-foreground/80">
                  {selectedPerson.commonAlias ?? selectedPerson.icgId}{" "}
                  <span className="text-muted-foreground">({selectedPerson.icgId})</span>
                </div>
                <Select
                  value={pendingRole}
                  onValueChange={(v) => setPendingRole(v as Contributor["role"])}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main</SelectItem>
                    <SelectItem value="supporting">Supporting</SelectItem>
                    <SelectItem value="background">Background</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" onClick={addSelectedPerson}>
                  Add
                </Button>
              </div>
            )}
          </section>

          {/* New person form */}
          <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowNewPersonForm((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <UserPlus size={15} />
              {showNewPersonForm ? "Cancel new person" : "Add new person…"}
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
                <div className="flex items-center gap-2">
                  <Select
                    value={newPersonRole}
                    onValueChange={(v) => setNewPersonRole(v as Contributor["role"])}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">Main</SelectItem>
                      <SelectItem value="supporting">Supporting</SelectItem>
                      <SelectItem value="background">Background</SelectItem>
                    </SelectContent>
                  </Select>
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
              </div>
            )}
          </section>

          {/* Contributors list */}
          {contributors.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contributors ({contributors.length})
              </p>
              <ul className="space-y-1.5">
                {contributors.map((c) => (
                  <li
                    key={c.personId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{c.displayName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{c.icgId}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[c.role]}`}
                      >
                        {ROLE_LABELS[c.role]}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeContributor(c.personId)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${c.displayName}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {contributors.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No contributors added yet. Search above or skip to finish.
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
          {isSaving ? "Saving…" : contributors.length > 0 ? "Done" : "Finish"}
        </Button>
      </SheetFooter>
    </div>
  );
}
