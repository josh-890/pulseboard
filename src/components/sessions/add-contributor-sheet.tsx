"use client";

import { useState, useRef, useEffect } from "react";
import { UserSearch, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSessionContributionAction,
  getPersonErasForPickerAction,
} from "@/lib/actions/contribution-actions";
import { searchPersonsAction } from "@/lib/actions/set-actions";

type PersonResult = {
  id: string;
  icgId: string;
  commonAlias: string | null;
  matchedAlias: string | null;
};

type RoleDefinitionOption = {
  id: string;
  name: string;
  groupName: string;
};

type EraOption = { id: string; label: string; date: Date | null; isBaseline: boolean };

type AddContributorSheetProps = {
  sessionId: string;
  sessionDate: Date | null;
  roleDefinitions: RoleDefinitionOption[];
};

export function AddContributorSheet({ sessionId, sessionDate, roleDefinitions }: AddContributorSheetProps) {
  const [open, setOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);

  const [roleDefinitionId, setRoleDefinitionId] = useState<string>(roleDefinitions[0]?.id ?? "");
  const [creditNameOverride, setCreditNameOverride] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Era picker (ADR-0004). Eras are loaded when a person is selected; the
  // default selection is the latest non-baseline Era whose anchor date is
  // ≤ the session date (or the baseline if none qualifies).
  const [eras, setEras] = useState<EraOption[]>([]);
  const [eraId, setEraId] = useState<string>("");
  const [erasLoading, setErasLoading] = useState(false);

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

  async function selectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setSearchQuery(person.commonAlias ?? person.icgId);
    setSearchResults([]);
    setShowDropdown(false);
    setErasLoading(true);
    try {
      const list = await getPersonErasForPickerAction(person.id);
      setEras(list);
      // Default to the latest non-baseline era with anchor date ≤ session date.
      // Falls back to baseline when nothing qualifies.
      const baseline = list.find((e) => e.isBaseline) ?? null;
      let chosen: EraOption | null = baseline;
      if (sessionDate) {
        const sd = new Date(sessionDate);
        const candidates = list
          .filter((e) => !e.isBaseline && e.date && new Date(e.date) <= sd)
          .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
        chosen = candidates[0] ?? baseline;
      }
      setEraId(chosen?.id ?? "");
    } finally {
      setErasLoading(false);
    }
  }

  function clearSelection() {
    setSelectedPerson(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setEras([]);
    setEraId("");
  }

  function resetForm() {
    setSelectedPerson(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setRoleDefinitionId(roleDefinitions[0]?.id ?? "");
    setCreditNameOverride("");
    setEras([]);
    setEraId("");
  }

  async function handleSave() {
    if (!selectedPerson || !roleDefinitionId) return;
    setIsSaving(true);
    const result = await addSessionContributionAction(
      sessionId,
      selectedPerson.id,
      roleDefinitionId,
      {
        creditNameOverride: creditNameOverride.trim() || undefined,
        eraId: eraId || null,
      },
    );
    if (result.success) {
      toast.success("Contributor added");
      setOpen(false);
      resetForm();
    } else {
      toast.error(result.error ?? "Failed to add contributor");
    }
    setIsSaving(false);
  }

  // Group role definitions by group name for the select
  const roleGroups = roleDefinitions.reduce<Map<string, RoleDefinitionOption[]>>((acc, rd) => {
    const group = acc.get(rd.groupName) ?? [];
    group.push(rd);
    acc.set(rd.groupName, group);
    return acc;
  }, new Map());

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Plus size={13} />
          Add
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[420px] flex-col p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Add Contributor</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Person search */}
          <div className="space-y-1.5">
            <Label>Person</Label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <UserSearch
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  placeholder="Search by name or ICG ID…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  className="pl-8 pr-8"
                  disabled={!!selectedPerson}
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
                    onClick={clearSelection}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear"
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
                          onClick={() => selectPerson(person)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors"
                        >
                          <span className="font-medium">
                            {person.commonAlias ?? person.icgId}
                            {person.matchedAlias && (
                              <span className="font-normal text-muted-foreground">
                                {" "}(a.k.a.: {person.matchedAlias})
                              </span>
                            )}
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
                  No matching persons found
                </div>
              )}
            </div>

            {selectedPerson && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {selectedPerson.commonAlias ?? selectedPerson.icgId} ({selectedPerson.icgId}) selected
              </p>
            )}
          </div>

          {/* Role selector */}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={roleDefinitionId} onValueChange={setRoleDefinitionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(roleGroups.entries()).map(([groupName, defs]) => (
                  <SelectGroup key={groupName}>
                    <SelectLabel>{groupName}</SelectLabel>
                    {defs.map((rd) => (
                      <SelectItem key={rd.id} value={rd.id}>
                        {rd.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Era picker — ADR-0004 */}
          {selectedPerson && (
            <div className="space-y-1.5">
              <Label>
                Era <span className="text-muted-foreground font-normal">(appearance at this shoot)</span>
              </Label>
              {erasLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> loading eras…
                </div>
              ) : eras.length === 0 ? (
                <p className="text-xs text-muted-foreground">No eras for this person yet.</p>
              ) : (
                <Select value={eraId} onValueChange={setEraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an era…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eras.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.label}
                        {e.isBaseline ? " · baseline" : e.date ? ` · ${new Date(e.date).getUTCFullYear()}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Credit name override */}
          <div className="space-y-1.5">
            <Label>
              Credited as <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="Name used in the credit, if different…"
              value={creditNameOverride}
              onChange={(e) => setCreditNameOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the person&apos;s common name.
            </p>
          </div>
        </div>

        <SheetFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedPerson || !roleDefinitionId || isSaving}
          >
            {isSaving && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {isSaving ? "Adding…" : "Add Contributor"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
