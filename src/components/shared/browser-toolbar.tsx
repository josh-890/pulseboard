"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  ArrowUpDown,
  Check,
  ChevronDown,
  FilterX,
  Calendar,
  User,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { clearBrowseContext } from "@/lib/browse-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = {
  value: string;
  label: string;
};

type PillFilter = {
  type: "pill";
  param: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
};

type FacetFilter = {
  type: "facet";
  param: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  searchable?: boolean;
};

// Multi-select variant of `facet`. URL is a comma-separated list of
// option values for the single `param` key (e.g. `?rating=5,4,unrated`).
// Each option toggles independently; absent param = no filter.
type MultiFacetFilter = {
  type: "multifacet";
  param: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  searchable?: boolean;
};

type ToggleFilter = {
  type: "toggle";
  param: string;
  label: string;
};

type DateRangeFilter = {
  type: "daterange";
  paramFrom: string;
  paramTo: string;
  label: string;
};

type TypeaheadFilter = {
  type: "typeahead";
  param: string;
  label: string;
  apiPath: string;
  displayParam?: string;
};

type FilterGroup = PillFilter | FacetFilter | MultiFacetFilter | ToggleFilter | DateRangeFilter | TypeaheadFilter;

type GroupByOption = {
  value: string;
  label: string;
};

type BrowserToolbarConfig = {
  basePath: string;
  searchPlaceholder: string;
  sortOptions: SortOption[];
  defaultSort: string;
  filterGroups: FilterGroup[];
  resultCount: number;
  totalCount: number;
  /** sessionStorage key for the browse context — used to clear it on filter reset */
  browseContextKey?: string;
  /** When provided, renders a "Group by" dropdown next to the sort control. */
  groupByOptions?: GroupByOption[];
  defaultGroupBy?: string;
};

export type {
  BrowserToolbarConfig,
  FilterGroup,
  PillFilter,
  FacetFilter,
  ToggleFilter,
  DateRangeFilter,
  TypeaheadFilter,
  SortOption,
  GroupByOption,
};

// ─── Component ────────────────────────────────────────────────────────────────

type BrowserToolbarProps = {
  config: BrowserToolbarConfig;
  children?: React.ReactNode;
};

export function BrowserToolbar({ config, children }: BrowserToolbarProps) {
  const {
    basePath,
    searchPlaceholder,
    sortOptions,
    defaultSort,
    filterGroups,
    browseContextKey,
  } = config;

  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchValue, setSearchValue] = useState(
    searchParams.get("q") ?? "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current sort
  const currentSort = searchParams.get("sort") ?? defaultSort;

  // Current groupBy
  const defaultGroupBy = config.defaultGroupBy ?? "none";
  const currentGroupBy = searchParams.get("groupBy") ?? defaultGroupBy;

  // Helper to update URL params
  const updateParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      // Reset loaded count when filters change
      params.delete("loaded");
      router.replace(`${basePath}?${params.toString()}`);
    },
    [searchParams, router, basePath],
  );

  // Sort stickiness: apply saved sort on mount if URL has no sort param
  useEffect(() => {
    const currentSortParam = searchParams.get("sort");
    if (!currentSortParam) {
      try {
        const saved = localStorage.getItem(`pulseboard-sort-${basePath}`);
        if (saved && sortOptions.some((o) => o.value === saved) && saved !== defaultSort) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("sort", saved);
          params.delete("loaded");
          router.replace(`${basePath}?${params.toString()}`);
        }
      } catch {
        // localStorage unavailable (SSR or restricted context)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const currentQ = searchParams.get("q") ?? "";
      const trimmed = searchValue.trim();
      if (trimmed === currentQ) return;
      updateParams((params) => {
        if (trimmed) {
          params.set("q", trimmed);
        } else {
          params.delete("q");
        }
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, searchParams, updateParams]);

  // Keyboard shortcuts: "/" to focus search, Escape to clear
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) &&
        !(e.target as HTMLElement).isContentEditable
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSearchClear() {
    setSearchValue("");
    updateParams((params) => params.delete("q"));
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      handleSearchClear();
      searchInputRef.current?.blur();
    }
  }

  function handleGroupByChange(value: string) {
    updateParams((params) => {
      if (!value || value === defaultGroupBy) {
        params.delete("groupBy");
      } else {
        params.set("groupBy", value);
      }
    });
  }

  function handleSortChange(value: string) {
    try {
      localStorage.setItem(`pulseboard-sort-${basePath}`, value);
    } catch {
      // localStorage unavailable
    }
    updateParams((params) => {
      if (value === defaultSort) {
        params.delete("sort");
      } else {
        params.set("sort", value);
      }
    });
  }

  function handlePillSelect(param: string, value: string) {
    updateParams((params) => {
      if (value === "all") {
        params.delete(param);
      } else {
        params.set(param, value);
      }
    });
  }

  function handleFacetSelect(param: string, value: string) {
    updateParams((params) => {
      const current = params.get(param);
      if (current === value) {
        params.delete(param);
      } else {
        params.set(param, value);
      }
    });
  }

  function handleMultiFacetToggle(param: string, value: string) {
    updateParams((params) => {
      const current = params.get(param);
      const selected = current ? current.split(",").filter(Boolean) : [];
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      if (next.length === 0) {
        params.delete(param);
      } else {
        params.set(param, next.join(","));
      }
    });
  }

  function handleToggle(param: string) {
    updateParams((params) => {
      if (params.has(param)) {
        params.delete(param);
      } else {
        params.set(param, "true");
      }
    });
  }

  function handleDateRangeChange(paramFrom: string, paramTo: string, from: string, to: string) {
    updateParams((params) => {
      if (from) params.set(paramFrom, from); else params.delete(paramFrom);
      if (to) params.set(paramTo, to); else params.delete(paramTo);
    });
  }

  function handleTypeaheadSelect(param: string, displayParam: string | undefined, id: string, displayName: string) {
    updateParams((params) => {
      if (id) {
        params.set(param, id);
        if (displayParam) params.set(displayParam, displayName);
      } else {
        params.delete(param);
        if (displayParam) params.delete(displayParam);
      }
    });
  }

  // Collect active filter chips — each chip knows which params to remove
  const activeChips: { label: string; params: string[]; replacementValue?: string }[] = [];
  for (const group of filterGroups) {
    if (group.type === "pill" || group.type === "facet") {
      const paramValue = searchParams.get(group.param);
      if (!paramValue || paramValue === "all") continue;
      const opt = group.options.find((o) => o.value === paramValue);
      if (opt) {
        activeChips.push({
          label: `${group.label}: ${opt.label}`,
          params: [group.param],
        });
      }
    } else if (group.type === "multifacet") {
      const paramValue = searchParams.get(group.param);
      if (!paramValue) continue;
      const selected = paramValue.split(",").filter(Boolean);
      for (const value of selected) {
        const opt = group.options.find((o) => o.value === value);
        if (!opt) continue;
        // Each selected value gets its own removable chip. Removing one
        // rewrites the param to the remaining comma-joined values (or
        // deletes the param entirely if it was the last one).
        const remaining = selected.filter((v) => v !== value);
        activeChips.push({
          label: `${group.label}: ${opt.label}`,
          params: [group.param],
          replacementValue: remaining.length > 0 ? `${group.param}=${remaining.join(",")}` : undefined,
        });
      }
    } else if (group.type === "toggle") {
      if (searchParams.get(group.param) === "true") {
        activeChips.push({ label: group.label, params: [group.param] });
      }
    } else if (group.type === "daterange") {
      const from = searchParams.get(group.paramFrom);
      const to = searchParams.get(group.paramTo);
      if (from || to) {
        const range = from && to ? `${from} – ${to}` : from ? `from ${from}` : `to ${to}`;
        activeChips.push({
          label: `${group.label}: ${range}`,
          params: [group.paramFrom, group.paramTo],
        });
      }
    } else if (group.type === "typeahead") {
      const paramValue = searchParams.get(group.param);
      if (paramValue) {
        const displayValue = group.displayParam
          ? (searchParams.get(group.displayParam) ?? paramValue)
          : paramValue;
        activeChips.push({
          label: `${group.label}: ${displayValue}`,
          params: [group.param, ...(group.displayParam ? [group.displayParam] : [])],
        });
      }
    }
  }

  const hasActiveFilters =
    activeChips.length > 0 ||
    currentSort !== defaultSort ||
    currentGroupBy !== defaultGroupBy ||
    searchParams.has("q");

  function handleClearAll() {
    setSearchValue("");
    clearBrowseContext(browseContextKey);
    router.replace(basePath);
  }

  function handleRemoveChip(params: string[], replacementValue?: string) {
    updateParams((p) => {
      for (const param of params) p.delete(param);
      if (replacementValue) {
        // Multi-facet chip removal: param has other selected values that
        // should survive. replacementValue is the `param=v1,v2` form.
        const [k, v] = replacementValue.split("=");
        if (k && v) p.set(k, v);
      }
    });
  }

  const currentSortLabel =
    sortOptions.find((o) => o.value === currentSort)?.label ?? "Sort";

  return (
    <div className="space-y-3">
      {/* Main toolbar row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className={cn("pl-9 pr-16", searchValue && "pr-20")}
            aria-label={searchPlaceholder}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchValue && (
              <button
                type="button"
                onClick={handleSearchClear}
                aria-label="Clear search"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={14} />
              </button>
            )}
            {!searchValue && (
              <kbd className="pointer-events-none hidden rounded border border-white/15 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Sort dropdown */}
        <SortDropdown
          options={sortOptions}
          currentValue={currentSort}
          currentLabel={currentSortLabel}
          onChange={handleSortChange}
        />

        {/* Group by dropdown (optional) */}
        {config.groupByOptions && config.groupByOptions.length > 0 && (
          <GroupByDropdown
            options={config.groupByOptions}
            currentValue={currentGroupBy}
            onChange={handleGroupByChange}
          />
        )}

        {/* Filter groups */}
        {filterGroups.map((group) => {
          if (group.type === "pill") {
            const current = searchParams.get(group.param) ?? "all";
            return (
              <div key={group.param} className="flex flex-wrap gap-1.5" role="group" aria-label={`Filter by ${group.label}`}>
                {group.options.map((option) => {
                  const isActive =
                    option.value === "all"
                      ? current === "all"
                      : current === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handlePillSelect(group.param, option.value)}
                      aria-pressed={isActive}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isActive
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
                      )}
                    >
                      {option.label}
                      {option.count !== undefined && !isActive && (
                        <span className="ml-1 opacity-60">{option.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          }

          if (group.type === "facet") {
            const current = searchParams.get(group.param);
            return (
              <FacetDropdown
                key={group.param}
                filter={group}
                currentValue={current ?? undefined}
                onChange={(v) => handleFacetSelect(group.param, v)}
              />
            );
          }

          if (group.type === "multifacet") {
            const current = searchParams.get(group.param);
            const selected = current ? current.split(",").filter(Boolean) : [];
            return (
              <MultiFacetDropdown
                key={group.param}
                filter={group}
                selected={selected}
                onToggle={(v) => handleMultiFacetToggle(group.param, v)}
              />
            );
          }

          if (group.type === "toggle") {
            const isActive = searchParams.get(group.param) === "true";
            return (
              <button
                key={group.param}
                type="button"
                onClick={() => handleToggle(group.param)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
                )}
              >
                {group.label}
              </button>
            );
          }

          if (group.type === "daterange") {
            const fromVal = searchParams.get(group.paramFrom) ?? "";
            const toVal = searchParams.get(group.paramTo) ?? "";
            const isActive = !!(fromVal || toVal);
            return (
              <DateRangeDropdown
                key={`${group.paramFrom}-${group.paramTo}`}
                label={group.label}
                fromValue={fromVal}
                toValue={toVal}
                isActive={isActive}
                onChange={(from, to) => handleDateRangeChange(group.paramFrom, group.paramTo, from, to)}
              />
            );
          }

          if (group.type === "typeahead") {
            const currentId = searchParams.get(group.param);
            const currentDisplay = group.displayParam
              ? (searchParams.get(group.displayParam) ?? undefined)
              : undefined;
            return (
              <TypeaheadDropdown
                key={group.param}
                label={group.label}
                apiPath={group.apiPath}
                currentId={currentId ?? undefined}
                currentDisplay={currentDisplay}
                onSelect={(id, name) =>
                  handleTypeaheadSelect(group.param, group.displayParam, id, name)
                }
                onClear={() =>
                  handleTypeaheadSelect(group.param, group.displayParam, "", "")
                }
              />
            );
          }

          return null;
        })}

        {/* Extra children (e.g., headshot slot selector) */}
        {children}
      </div>

      {/* Active filter banner */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="mr-1 text-xs font-medium text-amber-400/80">
            Filtered view
          </span>
          {currentSort !== defaultSort && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <ArrowUpDown size={10} />
              {currentSortLabel}
            </span>
          )}
          {currentGroupBy !== defaultGroupBy && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Layers size={10} />
              {config.groupByOptions?.find((o) => o.value === currentGroupBy)?.label ?? currentGroupBy}
            </span>
          )}
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleRemoveChip(chip.params, chip.replacementValue)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {chip.label}
              <X size={10} />
            </button>
          ))}
          <div className="ml-auto">
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              <FilterX size={12} />
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortDropdown({
  options,
  currentValue,
  currentLabel,
  onChange,
}: {
  options: SortOption[];
  currentValue: string;
  currentLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-white/20 bg-card/50 text-xs text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground"
        >
          <ArrowUpDown size={12} />
          {currentLabel}
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    size={14}
                    className={cn(
                      "mr-2",
                      currentValue === option.value
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Multi-select counterpart of FacetDropdown. Popover stays open across
// clicks; each item toggles inclusion in the comma-separated URL value.
// Trigger displays "{Label}: N" when one or more options are picked.
function MultiFacetDropdown({
  filter,
  selected,
  onToggle,
}: {
  filter: MultiFacetFilter;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = selected.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            activeCount > 0
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
          )}
        >
          {activeCount > 0 ? `${filter.label}: ${activeCount}` : filter.label}
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          {filter.searchable !== false && filter.options.length > 6 && (
            <CommandInput placeholder={`Search ${filter.label.toLowerCase()}...`} />
          )}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {filter.options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onToggle(option.value);
                      // Deliberately leave popover open so multiple
                      // selections can be made in one gesture.
                    }}
                  >
                    <Check
                      size={14}
                      className={cn(
                        "mr-2 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
                        {option.count}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FacetDropdown({
  filter,
  currentValue,
  onChange,
}: {
  filter: FacetFilter;
  currentValue?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = filter.options.find(
    (o) => o.value === currentValue,
  )?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            currentValue
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
          )}
        >
          {selectedLabel ?? filter.label}
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          {filter.searchable !== false && filter.options.length > 6 && (
            <CommandInput placeholder={`Search ${filter.label.toLowerCase()}...`} />
          )}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {filter.options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    size={14}
                    className={cn(
                      "mr-2 shrink-0",
                      currentValue === option.value
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="flex-1">{option.label}</span>
                  {option.count !== undefined && (
                    <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeDropdown({
  label,
  fromValue,
  toValue,
  isActive,
  onChange,
}: {
  label: string;
  fromValue: string;
  toValue: string;
  isActive: boolean;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(fromValue);
  const [localTo, setLocalTo] = useState(toValue);

  // Sync local state when external values change (e.g. chip removal)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalFrom(fromValue);
    setLocalTo(toValue);
  }, [fromValue, toValue]);

  function commit(from: string, to: string) {
    onChange(from, to);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            isActive
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
          )}
        >
          <Calendar size={12} />
          {label}
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">From</label>
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                onBlur={() => commit(localFrom, localTo)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">To</label>
              <input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                onBlur={() => commit(localFrom, localTo)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          {isActive && (
            <button
              type="button"
              onClick={() => { setLocalFrom(""); setLocalTo(""); commit("", ""); setOpen(false); }}
              className="w-full rounded-md border border-white/15 bg-muted/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              Clear range
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupByDropdown({
  options,
  currentValue,
  onChange,
}: {
  options: GroupByOption[];
  currentValue: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeOption = options.find((o) => o.value === currentValue);
  const isGrouped = currentValue !== "none" && !!currentValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            isGrouped
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
          )}
        >
          <Layers size={12} />
          {isGrouped ? activeOption?.label : "Group by"}
          <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    size={14}
                    className={cn(
                      "mr-2",
                      currentValue === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type TypeaheadResult = { id: string; displayName: string; icgId?: string; matchedAlias?: string | null };

function TypeaheadDropdown({
  label,
  apiPath,
  currentId,
  currentDisplay,
  onSelect,
  onClear,
}: {
  label: string;
  apiPath: string;
  currentId?: string;
  currentDisplay?: string;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TypeaheadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiPath}?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, apiPath, open]);

  const isActive = !!currentId;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setQuery(""); setResults([]); }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            isActive
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:bg-card/80 hover:text-foreground",
          )}
        >
          <User size={12} />
          {isActive && currentDisplay ? currentDisplay : label}
          {isActive ? (
            <span
              role="button"
              aria-label={`Clear ${label} filter`}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="ml-0.5 rounded p-0.5 hover:text-foreground"
            >
              <X size={10} />
            </span>
          ) : (
            <ChevronDown size={12} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {loading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          )}
          {!loading && query && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No results.</p>
          )}
          {!loading && !query && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Type to search…</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onSelect(r.id, r.displayName); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50",
                currentId === r.id && "bg-primary/10 text-primary",
              )}
            >
              <Check
                size={12}
                className={cn("shrink-0", currentId === r.id ? "opacity-100" : "opacity-0")}
              />
              <span className="flex-1 truncate min-w-0">
                {r.displayName}
                {r.matchedAlias && (
                  <span className="font-normal text-muted-foreground"> (a.k.a. {r.matchedAlias})</span>
                )}
              </span>
              {r.icgId && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{r.icgId}</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
