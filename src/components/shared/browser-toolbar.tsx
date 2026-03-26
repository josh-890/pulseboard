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
  options: { value: string; label: string }[];
};

type FacetFilter = {
  type: "facet";
  param: string;
  label: string;
  options: { value: string; label: string }[];
  searchable?: boolean;
};

type ToggleFilter = {
  type: "toggle";
  param: string;
  label: string;
};

type FilterGroup = PillFilter | FacetFilter | ToggleFilter;

type BrowserToolbarConfig = {
  basePath: string;
  searchPlaceholder: string;
  sortOptions: SortOption[];
  defaultSort: string;
  filterGroups: FilterGroup[];
  resultCount: number;
  totalCount: number;
};

export type { BrowserToolbarConfig, FilterGroup, PillFilter, FacetFilter, ToggleFilter, SortOption };

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

  function handleSortChange(value: string) {
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

  function handleToggle(param: string) {
    updateParams((params) => {
      if (params.has(param)) {
        params.delete(param);
      } else {
        params.set(param, "true");
      }
    });
  }

  // Collect active filter chips
  const activeChips: { label: string; param: string; value: string }[] = [];
  for (const group of filterGroups) {
    const paramValue = searchParams.get(group.param);
    if (!paramValue || paramValue === "all") continue;

    if (group.type === "pill" || group.type === "facet") {
      const opt = group.options.find((o) => o.value === paramValue);
      if (opt) {
        activeChips.push({
          label: `${group.label}: ${opt.label}`,
          param: group.param,
          value: paramValue,
        });
      }
    } else if (group.type === "toggle" && paramValue === "true") {
      activeChips.push({
        label: group.label,
        param: group.param,
        value: "true",
      });
    }
  }

  const hasActiveFilters =
    activeChips.length > 0 ||
    currentSort !== defaultSort ||
    searchParams.has("q");

  function handleClearAll() {
    setSearchValue("");
    clearBrowseContext();
    router.replace(basePath);
  }

  function handleRemoveChip(param: string) {
    updateParams((params) => params.delete(param));
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

        {/* Pill filters */}
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
          {activeChips.map((chip) => (
            <button
              key={chip.param}
              type="button"
              onClick={() => handleRemoveChip(chip.param)}
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
