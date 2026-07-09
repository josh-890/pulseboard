"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Briefcase, Camera, Film, List, Plus, Rows3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MultiFacetDropdown } from "@/components/shared/browser-toolbar";
import { ratingFilterOptions } from "@/components/shared/rating-filter-options";
import {
  TimelineSection,
  type CareerGroupBy,
  type CareerDensity,
} from "@/components/career/timeline-section";
import { CreateKnownSetSheet } from "@/components/staging-sets/create-known-set-sheet";
import { CareerStatsStrip } from "@/components/people/career-stats-strip";
import type {
  CareerTimelineRow,
  CareerFacetCounts,
  CareerSort,
  CareerStats,
} from "@/lib/services/career-service";
import type { PersonAffiliation } from "@/lib/types";
import type { SetType } from "@/generated/prisma/client";

// Career tab — unified chronological timeline. See ADR-0011 + the plan
// at /home/josh/.claude/plans/we-keep-freckles-scalar-twinkly-squirrel.md
// for the design rationale.

type CareerTabPerson = {
  id: string;
  activeFrom: Date | null;
  activeFromPrecision: string;
  retiredAt: Date | null;
  retiredAtPrecision: string;
  specialization: string | null;
  aliases: { name: string; isCommon: boolean }[];
};

export type CareerTabProps = {
  person: CareerTabPerson;
  careerTimeline: CareerTimelineRow[];
  careerStats: CareerStats;
  facetCounts: CareerFacetCounts;
  channels: { id: string; name: string }[];
  eras: { id: string; label: string }[];
  affiliations: PersonAffiliation[];
  // Active filter values (already parsed from URL by the server page).
  activeType: SetType; // "photo" | "video"
  activeChannelIds: string[];
  activeRatings: (number | "unrated")[];
  activeEraIds: string[];
  activeArchiveStatuses: string[];
  activeLabelIds: string[];
  activeStatuses: string[];
  activeSort: CareerSort;
  withTint: boolean;
};

const SORT_LABELS: Record<CareerSort, string> = {
  "date-desc": "Newest first",
  "date-asc": "Oldest first",
  "rating-desc": "Highest rated",
  "rating-asc": "Lowest rated",
};

const ARCHIVE_STATUS_OPTIONS = [
  { value: "linked", label: "Linked / in archive" },
  { value: "unlinked", label: "Unlinked" },
  { value: "missing", label: "Missing on disk" },
  { value: "changed", label: "Archive changed" },
];

// Pipeline-status filter options, ordered by confidence toward canonical.
const STATUS_FILTER_OPTIONS = [
  { value: "promoted", label: "Promoted" },
  { value: "approved", label: "Approved" },
  { value: "reviewing", label: "In review" },
  { value: "pending", label: "Pending" },
];

// Dot colour per status — mirrors the row pill/stripe palette.
const STATUS_DOT_CLASS: Record<string, string> = {
  promoted: "bg-emerald-500",
  approved: "bg-cyan-500",
  reviewing: "bg-amber-500",
  pending: "bg-blue-500",
};

const GROUP_BY_LABELS: Record<CareerGroupBy, string> = {
  year: "Year",
  status: "Status",
  channelYear: "Channel → Year",
};

function formatIsoYM(d: Date | null, precision: string): string {
  if (!d) return "—";
  const y = d.getUTCFullYear();
  if (precision === "YEAR") return String(y);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function CareerTab({
  person,
  careerTimeline,
  careerStats,
  facetCounts,
  channels,
  eras,
  affiliations,
  activeType,
  activeChannelIds,
  activeRatings,
  activeEraIds,
  activeArchiveStatuses,
  activeLabelIds,
  activeStatuses,
  activeSort,
  withTint,
}: CareerTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createKnownSetOpen, setCreateKnownSetOpen] = useState(false);

  // Group-by mode is a pure client display preference (does not refetch), so
  // it lives in local state + localStorage rather than the URL. Restored after
  // mount to avoid a hydration mismatch.
  const [groupBy, setGroupBy] = useState<CareerGroupBy>("year");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`career.groupBy.${person.id}`);
    if (stored === "year" || stored === "status") {
      // Hydration-safe restore (default on first paint, upgrade after mount).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupBy(stored);
    }
  }, [person.id]);

  const handleGroupByChange = (next: CareerGroupBy) => {
    setGroupBy(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`career.groupBy.${person.id}`, next);
    }
  };

  // Row density (full cover cards vs compact single-line rows) — a client
  // display preference, persisted to localStorage, restored after mount.
  const [density, setDensity] = useState<CareerDensity>("full");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`career.density.${person.id}`);
    if (stored === "full" || stored === "compact") {
      // Hydration-safe restore (default on first paint, upgrade after mount).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDensity(stored);
    }
  }, [person.id]);

  const toggleDensity = () => {
    const next: CareerDensity = density === "full" ? "compact" : "full";
    setDensity(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`career.density.${person.id}`, next);
    }
  };

  // Type tab persistence: when URL has no explicit `ctype`, read from
  // localStorage and route. Once URL has it, sync to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlType = searchParams.get("ctype");
    const lsKey = `career.tab.${person.id}`;
    if (urlType) {
      window.localStorage.setItem(lsKey, urlType);
      return;
    }
    const stored = window.localStorage.getItem(lsKey);
    if (stored === "photo" || stored === "video") {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("ctype", stored);
      router.replace(`${pathname}?${sp.toString()}#career`);
    }
  }, [person.id, searchParams, router, pathname]);

  const setUrl = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      router.push(`${pathname}?${sp.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const handleTypeChange = (next: SetType) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`career.tab.${person.id}`, next);
    }
    setUrl((sp) => sp.set("ctype", next));
  };

  const handleMultifacetToggle = (param: string, value: string) => {
    setUrl((sp) => {
      const current = sp.get(param);
      const selected = current ? current.split(",").filter(Boolean) : [];
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      if (next.length === 0) sp.delete(param);
      else sp.set(param, next.join(","));
    });
  };

  const handleSortChange = (next: CareerSort) => {
    setUrl((sp) => {
      if (next === "date-desc") sp.delete("csort");
      else sp.set("csort", next);
    });
  };

  const handleClearFilters = () => {
    setUrl((sp) => {
      sp.delete("channel");
      sp.delete("crating");
      sp.delete("era");
      sp.delete("archive");
      sp.delete("clabel");
      sp.delete("cstatus");
    });
  };

  // Derived: derive affiliations from rows for Label Affiliations card,
  // unless explicit `affiliations` prop already has values. (Mirrors the
  // original CareerTab behaviour.)
  const derivedAffiliations = useMemo(() => {
    if (affiliations.length > 0) return affiliations;
    // Fall back: derive label affiliations from current timeline data.
    // (Note: labels aren't on CareerTimelineRow directly; this is a
    // placeholder until label data is plumbed through. Empty for now if
    // the server didn't pass affiliations.)
    return [];
  }, [affiliations]);

  // Channel options for filter dropdown. Only includes channels with a
  // non-zero count in the current view — channels that became empty due
  // to other active filters aren't useful to display.
  const channelOptions = useMemo(
    () =>
      channels
        .map((c) => ({
          value: c.id,
          label: c.name,
          count: facetCounts.channel[c.id] ?? 0,
        }))
        .filter((o) => o.count > 0),
    [channels, facetCounts.channel],
  );

  // Era options for filter dropdown.
  const eraOptions = useMemo(
    () =>
      eras.map((e) => ({
        value: e.id,
        label: e.label,
        count: facetCounts.era[e.id],
      })),
    [eras, facetCounts.era],
  );

  const ratingOptions = useMemo(
    () => ratingFilterOptions(facetCounts.rating ?? {}),
    [facetCounts.rating],
  );

  const archiveOptions = useMemo(
    () =>
      ARCHIVE_STATUS_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        count: facetCounts.archiveStatus[o.value],
      })),
    [facetCounts.archiveStatus],
  );

  const statusOptions = useMemo(
    () =>
      STATUS_FILTER_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        count: facetCounts.status?.[o.value] ?? 0,
      })),
    [facetCounts.status],
  );

  // Label filter options — derived from the person's affiliations (labelId /
  // name + per-type counts). Filtered to the active type with a non-zero
  // count, mirroring the Channel dropdown's behaviour.
  const labelOptions = useMemo(
    () =>
      derivedAffiliations
        .map((a) => ({
          value: a.labelId,
          label: a.labelName,
          count: activeType === "photo" ? a.photoCount : a.videoCount,
        }))
        .filter((o) => o.count > 0),
    [derivedAffiliations, activeType],
  );

  const anyFilterActive =
    activeChannelIds.length > 0 ||
    activeRatings.length > 0 ||
    activeEraIds.length > 0 ||
    activeArchiveStatuses.length > 0 ||
    activeLabelIds.length > 0 ||
    activeStatuses.length > 0;

  return (
    <div className="space-y-4">
      {/* Compact Professional + Specialization row */}
      {(person.activeFrom || person.retiredAt || person.specialization) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Briefcase size={12} />
            <span className="uppercase tracking-wider opacity-70">Career</span>
          </span>
          {person.activeFrom && (
            <span>
              <span className="text-muted-foreground">Active from </span>
              <span className="font-mono tabular-nums">
                {formatIsoYM(person.activeFrom, person.activeFromPrecision)}
              </span>
            </span>
          )}
          {person.retiredAt && (
            <span>
              <span className="text-muted-foreground">Retired </span>
              <span className="font-mono tabular-nums">
                {formatIsoYM(person.retiredAt, person.retiredAtPrecision)}
              </span>
            </span>
          )}
          {person.specialization && (
            <span>
              <span className="text-muted-foreground">Specialization </span>
              <span>{person.specialization}</span>
            </span>
          )}
        </div>
      )}

      {/* Catalogue stats: claimed vs promoted vs staged (collapsed by default) */}
      <CareerStatsStrip stats={careerStats} />

      {/* Status quick-filter pills — toggle which pipeline states appear.
          Empty selection = all shown; an active pill filters to (only) the
          selected states. Dot colour matches the row pill/stripe palette. */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="uppercase tracking-wider text-muted-foreground opacity-70">
          Status
        </span>
        {statusOptions.map((o) => {
          const isActive = activeStatuses.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => handleMultifacetToggle("cstatus", o.value)}
              aria-pressed={isActive}
              title={
                isActive
                  ? `${o.label} — click to remove from filter`
                  : `${o.label} — click to filter`
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
                isActive
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-white/15 bg-muted/40 hover:bg-muted/60",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[o.value])} />
              <span>{o.label}</span>
              <span className="text-[10px] tabular-nums opacity-60">{o.count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter / sort bar */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiFacetDropdown
          filter={{
            type: "multifacet",
            param: "channel",
            label: "Channel",
            options: channelOptions,
            searchable: true,
          }}
          selected={activeChannelIds}
          onToggle={(v) => handleMultifacetToggle("channel", v)}
        />
        {labelOptions.length > 0 && (
          <MultiFacetDropdown
            filter={{
              type: "multifacet",
              param: "clabel",
              label: "Label",
              options: labelOptions,
              searchable: true,
            }}
            selected={activeLabelIds}
            onToggle={(v) => handleMultifacetToggle("clabel", v)}
          />
        )}
        <MultiFacetDropdown
          filter={{
            type: "multifacet",
            param: "crating",
            label: "Rating",
            options: ratingOptions,
            searchable: false,
          }}
          selected={activeRatings.map((r) => (r === "unrated" ? "unrated" : String(r)))}
          onToggle={(v) => handleMultifacetToggle("crating", v)}
        />
        {eraOptions.length > 0 && (
          <MultiFacetDropdown
            filter={{
              type: "multifacet",
              param: "era",
              label: "Era",
              options: eraOptions,
            }}
            selected={activeEraIds}
            onToggle={(v) => handleMultifacetToggle("era", v)}
          />
        )}
        <MultiFacetDropdown
          filter={{
            type: "multifacet",
            param: "archive",
            label: "Archive",
            options: archiveOptions,
            searchable: false,
          }}
          selected={activeArchiveStatuses}
          onToggle={(v) => handleMultifacetToggle("archive", v)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              Sort: {SORT_LABELS[activeSort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABELS) as CareerSort[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => handleSortChange(s)}>
                {SORT_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              Group: {GROUP_BY_LABELS[groupBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(GROUP_BY_LABELS) as CareerGroupBy[]).map((g) => (
              <DropdownMenuItem key={g} onSelect={() => handleGroupByChange(g)}>
                {GROUP_BY_LABELS[g]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDensity}
          aria-pressed={density === "compact"}
          title={
            density === "compact"
              ? "Compact rows — click for full cover cards"
              : "Full cover cards — click for compact rows"
          }
          className={cn(
            "h-8 gap-1 text-xs",
            density === "compact" && "border-primary/50 bg-primary/10 text-primary",
          )}
        >
          {density === "compact" ? <List size={12} /> : <Rows3 size={12} />}
          {density === "compact" ? "Compact" : "Full"}
        </Button>
        {anyFilterActive && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 hover:bg-amber-500/20 transition-colors"
          >
            <X size={11} />
            Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateKnownSetOpen(true)}
            className="h-8 gap-1 text-xs"
          >
            <Plus size={12} />
            Add known set
          </Button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        <TypeTabButton
          active={activeType === "photo"}
          onClick={() => handleTypeChange("photo")}
          icon={<Camera size={14} />}
          label="Photos"
          have={careerStats.promoted.photos + careerStats.staged.photos}
          claimed={careerStats.claimed.photosets}
        />
        <TypeTabButton
          active={activeType === "video"}
          onClick={() => handleTypeChange("video")}
          icon={<Film size={14} />}
          label="Videos"
          have={careerStats.promoted.videos + careerStats.staged.videos}
          claimed={careerStats.claimed.videos}
        />
      </div>

      {/* Timeline */}
      {careerTimeline.length === 0 ? (
        <CareerEmptyState
          activeType={activeType}
          anyFilterActive={anyFilterActive}
          onSwitchType={() =>
            handleTypeChange(activeType === "photo" ? "video" : "photo")
          }
          onClearFilters={handleClearFilters}
          onAddSet={() => setCreateKnownSetOpen(true)}
        />
      ) : (
        <TimelineSection
          rows={careerTimeline}
          withTint={withTint}
          groupBy={groupBy}
          density={density}
          collapseStorageKey={`career.collapse.${person.id}`}
        />
      )}

      <CreateKnownSetSheet
        open={createKnownSetOpen}
        onOpenChange={setCreateKnownSetOpen}
        initialPersonId={person.id}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

function TypeTabButton({
  active,
  onClick,
  icon,
  label,
  have,
  claimed,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  have: number;
  claimed: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[10px] tabular-nums opacity-60">
        {have}
        {claimed !== null && <span className="opacity-60">/{claimed}</span>}
      </span>
    </button>
  );
}

function CareerEmptyState({
  activeType,
  anyFilterActive,
  onSwitchType,
  onClearFilters,
  onAddSet,
}: {
  activeType: SetType;
  anyFilterActive: boolean;
  onSwitchType: () => void;
  onClearFilters: () => void;
  onAddSet: () => void;
}) {
  if (anyFilterActive) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/10 py-12 text-sm text-muted-foreground">
        <p>No sets match these filters.</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
        >
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/10 py-12 text-sm text-muted-foreground">
      <p>
        No {activeType === "photo" ? "photo" : "video"} sets recorded.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSwitchType}
          className="text-primary hover:underline text-xs"
        >
          View {activeType === "photo" ? "video" : "photo"} sets →
        </button>
        <span className="text-white/20">·</span>
        <button
          type="button"
          onClick={onAddSet}
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus size={11} />
          Add known set
        </button>
      </div>
    </div>
  );
}
