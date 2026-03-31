"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn, computeAge, formatPartialDate } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  PersonSessionWorkEntry,
  PersonProductionSession,
  PersonStatus,
  RelationshipSource,
} from "@/lib/types";
import { useHeroLayout, type HeroLayout } from "@/components/layout/hero-layout-provider";
import { FlagImage } from "@/components/shared/flag-image";
import { findCountryByCode } from "@/lib/constants/countries";
import { PersonaTimelineEntry } from "@/components/people/persona-timeline-entry";
import { AppearanceTab } from "@/components/people/appearance-tab";
import { NewPersonaSheet } from "@/components/people/new-persona-sheet";
import { DigitalIdentityRow } from "@/components/people/digital-identity-row";
import {
  Star,
  StarOff,
  BookUser,
  Users,
  Film,
  Network,
  MapPin,
  Tag,
  Building2,
  Cpu,
  Camera,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Image as ImageIcon,
  Link2,
  Plus,
  LayoutDashboard,
  Sparkles,
  FileImage,
  Zap,
  Pencil,
  Info,
  AlertTriangle,
  ArrowUpDown,
  Upload,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { CarouselHeader } from "@/components/gallery/carousel-header";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { PersonDetailsTab } from "@/components/people/person-details-tab";
import { SectionCard, EmptyState, InfoRow } from "@/components/people/person-detail-helpers";
import { PersonSkillsTab } from "@/components/people/person-skills-tab";
import { PersonAliasesTab } from "@/components/people/person-aliases-tab";
import { CareerSessionList } from "@/components/people/career-session-list";
import { ProductionPhotoList } from "@/components/people/production-photo-list";
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import type { PersonAliasWithChannels } from "@/lib/services/alias-service";
import type { GalleryItem } from "@/lib/types";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import type { PlausibilityIssue } from "@/lib/services/plausibility-service";
import {
  assignHeadshotSlot as assignHeadshotSlotAction,
  removeHeadshotSlot as removeHeadshotSlotAction,
} from "@/lib/actions/media-actions";
import { updatePersonBio, updatePersonPgrade, updatePersonRating } from "@/lib/actions/person-actions";
import { setEntityTagsAction } from "@/lib/actions/tag-actions";
import { TagPicker } from "@/components/shared/tag-picker";
import ReactMarkdown from "react-markdown";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type TabId = "overview" | "aliases" | "appearance" | "details" | "skills" | "career" | "network" | "photos";

type HeadshotSlotEntry = { mediaItemId: string; slot: number };

type PersonDetailTabsProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
  connections: PersonConnection[];
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  referenceSessionId?: string;
  filledHeadshotSlots?: number[];
  headshotSlotEntries?: HeadshotSlotEntry[];
  categories?: CategoryWithGroup[];
  categoryCounts?: { categoryId: string; count: number }[];
  skillGroups?: SkillGroupWithDefinitions[];
  physicalAttributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  aliasesWithChannels?: PersonAliasWithChannels[];
  sessionWorkHistory?: PersonSessionWorkEntry[];
  productionSessions?: PersonProductionSession[];
  entityMedia?: Record<string, EntityMediaThumbnail[]>;
  refMediaCount?: number;
  plausibilityIssues?: PlausibilityIssue[];
  initialTab?: string;
  entityTags?: { id: string; name: string; group: { name: string; color: string } }[];
};

// ── Style maps ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

const STATUS_DOT_COLORS: Record<PersonStatus, string> = {
  active: "bg-emerald-500",
  inactive: "bg-slate-400",
  wishlist: "bg-amber-500",
  archived: "bg-red-500",
};

type HeroAliasSummary = {
  id: string;
  name: string;
  isCommon: boolean;
  isBirth: boolean;
  usageCount: number;
  channelNames: string[];
};

const SOURCE_STYLES: Record<RelationshipSource, string> = {
  derived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  manual: "bg-primary/15 text-primary border-primary/30",
};

// ── Sub-components ──────────────────────────────────────────────────────────

// ── PGRADE Colors ────────────────────────────────────────────────────────────

const PGRADE_COLORS = [
  "rgb(162,214,176)",
  "rgb(177,214,160)",
  "rgb(196,214,140)",
  "rgb(213,200,125)",
  "rgb(230,176,110)",
  "rgb(224,155,110)",
  "rgb(219,133,110)",
  "rgb(214,110,110)",
  "rgb(171,103,143)",
  "rgb(128,96,176)",
];

// ── CP (Calculated PGRADE) Colors ────────────────────────────────────────────

const CP_COLORS = [
  "rgb(150,200,230)",
  "rgb(130,185,220)",
  "rgb(110,170,210)",
  "rgb(90,155,200)",
  "rgb(70,140,190)",
  "rgb(60,125,180)",
  "rgb(50,110,175)",
  "rgb(40,95,170)",
  "rgb(35,80,160)",
  "rgb(30,65,150)",
];

// ── Basic Info Panel ─────────────────────────────────────────────────────────

// ── Physical Stats Panel ─────────────────────────────────────────────────────

function PhysicalMetrics({
  person,
  currentState,
  labelWidth = "w-32",
  fieldGap = "gap-2",
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  labelWidth?: string;
  fieldGap?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-1 text-sm", fieldGap)}>
      <InfoRow label="Height" value={person.height ? `${person.height} cm` : "\u2014"} labelWidth={labelWidth} />
      <InfoRow label="Weight" value={currentState.weight !== null && currentState.weight !== undefined ? `${currentState.weight} kg` : "\u2014"} labelWidth={labelWidth} />
      {person.measurements && <InfoRow label="Measurements" value={person.measurements} labelWidth={labelWidth} />}
    </dl>
  );
}

function PhysicalDescriptive({
  person,
  currentState,
  labelWidth = "w-32",
  fieldGap = "gap-2",
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  labelWidth?: string;
  fieldGap?: string;
}) {
  const hasDescriptive = person.eyeColor || currentState.currentHairColor || person.bodyType || currentState.build;
  if (!hasDescriptive) return null;

  return (
    <dl className={cn("grid grid-cols-1 text-sm", fieldGap)}>
      {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} labelWidth={labelWidth} />}
      {currentState.currentHairColor && <InfoRow label="Current hair" value={<span className="capitalize">{currentState.currentHairColor}</span>} labelWidth={labelWidth} />}
      {person.bodyType && <InfoRow label="Body type" value={<span className="capitalize">{person.bodyType}</span>} labelWidth={labelWidth} />}
      {currentState.build && <InfoRow label="Build" value={<span className="capitalize">{currentState.build}</span>} labelWidth={labelWidth} />}
    </dl>
  );
}

// ── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  personas,
  personId,
  currentState,
  defaultOpen = false,
}: {
  personas: PersonData["personas"];
  personId: string;
  currentState: PersonCurrentState;
  defaultOpen?: boolean;
}) {
  const [timelineOpen, setTimelineOpen] = useState(defaultOpen);
  const [showNewPersona, setShowNewPersona] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const visiblePersonas = useMemo(() => {
    if (newestFirst) {
      return [...personas].reverse();
    }
    return personas;
  }, [personas, newestFirst]);

  if (visiblePersonas.length === 0 && !showNewPersona) {
    return (
      <div className="space-y-3">
        <EmptyState message="No persona history recorded." />
        <button
          type="button"
          onClick={() => setShowNewPersona(true)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={12} /> New Persona
        </button>
        {showNewPersona && (
          <NewPersonaSheet
            personId={personId}
            existingMarks={currentState.activeBodyMarks}
            existingMods={currentState.activeBodyModifications}
            existingProcs={currentState.activeCosmeticProcedures}
            onClose={() => setShowNewPersona(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTimelineOpen(!timelineOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          {timelineOpen ? (
            <>
              <ChevronUp size={14} /> Hide timeline
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show timeline ({visiblePersonas.length})
            </>
          )}
        </button>
        {timelineOpen && (
          <button
            type="button"
            onClick={() => setNewestFirst(!newestFirst)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            title={newestFirst ? "Showing newest first" : "Showing oldest first"}
          >
            <ArrowUpDown size={12} /> {newestFirst ? "Newest" : "Oldest"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowNewPersona(true)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} /> New Persona
        </button>
      </div>
      {timelineOpen && (
        <div className="relative space-y-4">
          {visiblePersonas.map((persona, i) => {
            const isFirst = i === 0;
            const isLast = i === visiblePersonas.length - 1;
            // In newest-first: open future extends above first entry, line stops at baseline (last)
            // In oldest-first: line starts at baseline (first), open future extends below last entry
            const connectAbove = newestFirst ? true : !isFirst;
            const connectBelow = newestFirst ? !isLast : true;
            return (
              <PersonaTimelineEntry
                key={persona.id}
                persona={persona}
                personId={personId}
                connectAbove={connectAbove}
                connectBelow={connectBelow}
              />
            );
          })}
        </div>
      )}
      {showNewPersona && (
        <NewPersonaSheet
          personId={personId}
          existingMarks={currentState.activeBodyMarks}
          existingMods={currentState.activeBodyModifications}
          existingProcs={currentState.activeCosmeticProcedures}
          onClose={() => setShowNewPersona(false)}
        />
      )}
    </div>
  );
}

// ── KPI Stats Panel ──────────────────────────────────────────────────────────

type KpiCounts = {
  sets: number;
  labels: number;
  photos: number;
  connections: number;
};

function KpiStatsPanel({
  person,
  kpiCounts,
  calculatedPgrade,
  meanWcp,
}: {
  person: PersonData;
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
}) {
  const [localPgrade, setLocalPgrade] = useState(person.pgrade);
  const [localRating, setLocalRating] = useState(person.rating);
  const [, startTransition] = useTransition();

  const tiles = [
    { icon: <Film size={14} />, count: kpiCounts.sets, label: "Sets" },
    { icon: <Building2 size={14} />, count: kpiCounts.labels, label: "Labels" },
    { icon: <ImageIcon size={14} />, count: kpiCounts.photos, label: "Photos" },
    { icon: <Link2 size={14} />, count: kpiCounts.connections, label: "Conn." },
  ];

  const hasPgrade = localPgrade !== null && localPgrade !== undefined;
  const hasCp = calculatedPgrade !== null && calculatedPgrade !== undefined;
  const hasWcp = meanWcp !== null && meanWcp !== undefined;

  const handlePgradeClick = (segment: number) => {
    const newValue = segment + 1;
    // Toggle off if clicking the same value
    const value = newValue === localPgrade ? null : newValue;
    setLocalPgrade(value);
    startTransition(() => {
      updatePersonPgrade(person.id, value);
    });
  };

  const handleRatingClick = (star: number) => {
    const newValue = star + 1;
    const value = newValue === localRating ? null : newValue;
    setLocalRating(value);
    startTransition(() => {
      updatePersonRating(person.id, value);
    });
  };

  return (
    <div className="flex flex-col">
      {/* Compact stats list */}
      <div className="space-y-1">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground" aria-hidden="true">{tile.icon}</span>
            <span className="font-semibold tabular-nums w-6 text-right">{tile.count}</span>
            <span className="text-xs text-muted-foreground">{tile.label}</span>
          </div>
        ))}
      </div>

      {/* Separator */}
      <div className="border-t border-white/10 my-2" />

      {/* PGRADE gauge — clickable */}
      <div className="space-y-2">
        <div title="Performance Grade — overall subjective rating (1-10 scale). Click to set.">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground w-12">PGRADE</span>
            <span className={cn("font-semibold tabular-nums", hasPgrade ? "" : "text-muted-foreground/40")}>
              {hasPgrade ? localPgrade : "\u2014"}
            </span>
          </div>
          <div className="mt-1 flex w-full gap-0.5 cursor-pointer" role="slider" aria-label="Set PGRADE" aria-valuemin={1} aria-valuemax={10} aria-valuenow={localPgrade ?? undefined}>
            {PGRADE_COLORS.map((color, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePgradeClick(i)}
                className="h-2.5 flex-1 first:rounded-l-md last:rounded-r-md transition-opacity hover:opacity-80"
                style={{ backgroundColor: color, opacity: hasPgrade && i < localPgrade! ? 1 : 0.15 }}
                title={`Set PGRADE to ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* CP gauge — read-only */}
        <div title="Cumulative Points — weighted aggregate of set participation scores">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground w-12">CP</span>
            <span className={cn("font-semibold tabular-nums", hasCp ? "" : "text-muted-foreground/40")}>
              {hasCp ? calculatedPgrade : "\u2014"}
            </span>
            {hasWcp && (
              <span className="text-xs font-semibold text-red-400" title="Weighted Cumulative Points — mean of all weighted set scores">
                W{meanWcp.toFixed(1)}
              </span>
            )}
          </div>
          <div className="relative mt-1 w-full">
            <div className="flex w-full gap-0.5">
              {CP_COLORS.map((color, i) => (
                <div
                  key={i}
                  className="h-2.5 flex-1 first:rounded-l-md last:rounded-r-md"
                  style={{ backgroundColor: color, opacity: hasCp && i < calculatedPgrade! ? 1 : 0.15 }}
                />
              ))}
            </div>
            {hasWcp && (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-red-500 ring-1 ring-black/40"
                style={{ left: `${(meanWcp / 10) * 100}%` }}
                title={`Mean WCP: ${meanWcp.toFixed(1)}`}
              />
            )}
          </div>
        </div>

        {/* Star Rating — clickable */}
        <div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground w-12">RATING</span>
            <span className={cn("font-semibold tabular-nums", localRating ? "" : "text-muted-foreground/40")}>
              {localRating ?? "\u2014"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-0.5 cursor-pointer" role="slider" aria-label="Set rating" aria-valuemin={1} aria-valuemax={5} aria-valuenow={localRating ?? undefined}>
            {Array.from({ length: 5 }, (_, i) => {
              const filled = localRating !== null && localRating !== undefined && i < localRating;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleRatingClick(i)}
                  className="transition-colors hover:scale-110"
                  title={`Set rating to ${i + 1}`}
                >
                  {filled ? (
                    <Star size={16} className="fill-amber-400 text-amber-400" />
                  ) : (
                    <StarOff size={16} className="text-muted-foreground/30 hover:text-amber-400/50" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Density Configuration ───────────────────────────────────────────────────

type HeroDensityConfig = {
  cardPadding: string;
  cardGap: string;
  photoWidth: number;
  photoHeight: number;
  labelWidth: string;
  fieldGap: string;
  kpiWidth: string;
  nameSize: string;
};

const DENSITY_CONFIGS: Record<HeroLayout, HeroDensityConfig> = {
  spacious: {
    cardPadding: "p-7",
    cardGap: "gap-6",
    photoWidth: 200,
    photoHeight: 250,
    labelWidth: "w-36",
    fieldGap: "gap-2.5",
    kpiWidth: "sm:w-56",
    nameSize: "text-2xl",
  },
  standard: {
    cardPadding: "p-5",
    cardGap: "gap-5",
    photoWidth: 180,
    photoHeight: 220,
    labelWidth: "w-32",
    fieldGap: "gap-2",
    kpiWidth: "sm:w-52",
    nameSize: "text-xl",
  },
  compact: {
    cardPadding: "p-4",
    cardGap: "gap-4",
    photoWidth: 160,
    photoHeight: 200,
    labelWidth: "w-28",
    fieldGap: "gap-1.5",
    kpiWidth: "sm:w-48",
    nameSize: "text-lg",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateDMY(date: Date, precision: string): string {
  if (precision === "UNKNOWN") return "";
  const y = date.getUTCFullYear();
  if (precision === "YEAR") return `${y}`;
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (precision === "MONTH") return `${m}/${y}`;
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${d}/${m}/${y}`;
}

function CareerTimeline({ activeFrom, retiredAt, birthYear, earliestSessionYear }: {
  activeFrom: Date | null;
  retiredAt: Date | null;
  birthYear: number | null;
  earliestSessionYear: number | null;
}) {
  const activeFromYear = activeFrom ? activeFrom.getUTCFullYear() : null;
  const retiredAtYear = retiredAt ? retiredAt.getUTCFullYear() : null;

  // Effective start: explicit activeFrom, or fallback to earliest session year
  const effectiveStart = activeFromYear ?? earliestSessionYear;
  if (!effectiveStart) return null;

  const inferred = activeFromYear === null;
  const retired = retiredAtYear !== null;
  const conflict = activeFromYear !== null && earliestSessionYear !== null && earliestSessionYear < activeFromYear;

  const currentYear = new Date().getUTCFullYear();
  const endYear = retiredAtYear ?? currentYear;
  const duration = endYear - effectiveStart;
  const startAge = birthYear ? effectiveStart - birthYear : null;
  const endAge = birthYear && retiredAtYear ? retiredAtYear - birthYear : null;
  // All timeline values are inherently approximate — dates may be year-only

  // Color scheme: grey for retired, emerald for active, amber for inferred start
  const dotColor = retired
    ? "bg-muted-foreground/60"
    : inferred
      ? "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.4)]"
      : "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]";
  const lineColor = retired
    ? "border-muted-foreground/30"
    : conflict
      ? "border-red-500/40 border-dashed"
      : inferred
        ? "border-amber-500/40 border-dashed"
        : "border-emerald-500/40";

  return (
    <div className="mt-2 flex max-w-48 items-center gap-0" aria-label="Career timeline">
      {/* Start node */}
      <div className="flex flex-col items-center gap-0.5">
        {startAge !== null && (
          <span className="text-[10px] leading-none text-muted-foreground">~{startAge}</span>
        )}
        {conflict ? (
          <span title={`Session found in ${earliestSessionYear}, before activeFrom ${activeFromYear}`}>
            <Zap size={12} className="fill-red-500 text-red-500" />
          </span>
        ) : (
          <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
        )}
        <span className="text-[10px] leading-none text-muted-foreground">{effectiveStart}</span>
      </div>
      {/* Line + duration */}
      <div className="relative mx-1 flex-1 py-2">
        <div className={cn(
          "absolute inset-x-0 top-1/2 -translate-y-px border-t-2",
          lineColor,
        )} />
        <span className="relative z-10 mx-auto block w-fit rounded-full bg-card/80 px-1.5 text-[10px] font-medium leading-none text-muted-foreground">
          ~{duration} yr{duration !== 1 ? "s" : ""}
        </span>
      </div>
      {/* End node (retired) or open arrow (active) */}
      {retiredAtYear ? (
        <div className="flex flex-col items-center gap-0.5">
          {endAge !== null && (
            <span className="text-[10px] leading-none text-muted-foreground">~{endAge}</span>
          )}
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />
          <span className="text-[10px] leading-none text-muted-foreground">{retiredAtYear}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] leading-none text-transparent">.</span>
          <span className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-emerald-500/60" />
          <span className="text-[10px] leading-none text-transparent">.</span>
        </div>
      )}
    </div>
  );
}

// ── Hero Card — shared types & identity block ──────────────────────────────

type HeroSharedProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  displayName: string;
  initials: string;
  age: number | null;
  heroAliases: HeroAliasSummary[];
  referenceSessionId?: string;
  refMediaCount?: number;
  headshotSlotMap?: Map<string, number>;
  earliestSessionYear?: number | null;
  onAliasesBadgeClick?: () => void;
  onAppearanceClick?: () => void;
  plausibilityCount?: number;
};

function EntityPills({ currentState, onAppearanceClick }: { currentState: PersonCurrentState; onAppearanceClick?: () => void }) {
  const heroEntities = [
    ...currentState.activeBodyMarks.filter((m) => m.heroVisible).map((m) => ({ kind: "mark" as const, label: m.type, heroOrder: m.heroOrder, id: m.id })),
    ...currentState.activeBodyModifications.filter((m) => m.heroVisible).map((m) => ({ kind: "mod" as const, label: m.type, heroOrder: m.heroOrder, id: m.id })),
    ...currentState.activeCosmeticProcedures.filter((p) => p.heroVisible).map((p) => ({ kind: "proc" as const, label: p.type, heroOrder: p.heroOrder, id: p.id })),
  ].sort((a, b) => (a.heroOrder ?? 999) - (b.heroOrder ?? 999));

  if (heroEntities.length === 0) return null;

  const visiblePills = heroEntities.slice(0, 4);
  const overflow = heroEntities.length - visiblePills.length;

  const pillStyles = {
    mark: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    mod: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    proc: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };

  const Wrapper = onAppearanceClick ? "button" : "div";
  return (
    <Wrapper
      {...(onAppearanceClick ? { type: "button" as const, onClick: onAppearanceClick } : {})}
      className="mt-3 flex flex-wrap items-center gap-1.5"
    >
      {visiblePills.map((e) => (
        <span key={`${e.kind}-${e.id}`} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", pillStyles[e.kind])}>
          {e.label}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          +{overflow} more
        </span>
      )}
    </Wrapper>
  );
}

function IdentityBlock({ person, displayName, age, heroAliases, onAliasesBadgeClick, nameSize = "text-2xl", earliestSessionYear, referenceSessionId, refMediaCount, section = "all", plausibilityCount = 0 }: {
  person: PersonData;
  displayName: string;
  age: number | null;
  heroAliases: HeroAliasSummary[];
  onAliasesBadgeClick?: () => void;
  nameSize?: string;
  earliestSessionYear?: number | null;
  referenceSessionId?: string;
  refMediaCount?: number;
  section?: "top" | "bottom" | "all";
  plausibilityCount?: number;
}) {
  const birthAlias = heroAliases.find((a) => a.isBirth && a.name !== displayName);
  const otherAliases = heroAliases.filter((a) => !a.isCommon && !a.isBirth);
  const MAX_VISIBLE = 8;
  const visibleOthers = otherAliases.slice(0, MAX_VISIBLE);
  const overflow = otherAliases.length - visibleOthers.length;

  const topSection = (
    <>
      <h1 className={cn("font-bold leading-tight", nameSize)}>{displayName}</h1>
      {displayName !== person.icgId && (
        <div className="mt-0.5 flex items-center gap-2">
          <p className="font-mono text-sm text-muted-foreground">{person.icgId}</p>
          {plausibilityCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500"
              title={`${plausibilityCount} data quality issue${plausibilityCount !== 1 ? "s" : ""}`}
            >
              <AlertTriangle size={12} />
              <span>{plausibilityCount}</span>
            </span>
          )}
          {referenceSessionId && (
            <Link
              href={`/sessions/${referenceSessionId}`}
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <Camera size={12} />
              {refMediaCount !== undefined && <span>{refMediaCount}</span>}
            </Link>
          )}
        </div>
      )}
    </>
  );

  const bottomSection = (
    <>
      {/* Aliases — inline flow, 3 lines max */}
      <div className="min-h-[3.25rem] max-w-[220px] text-xs leading-relaxed text-muted-foreground line-clamp-3">
        {birthAlias && (
          <span
            className="text-foreground hover:text-foreground transition-colors cursor-default"
            title={`Real name${birthAlias.channelNames.length > 0 ? `. Used on: ${birthAlias.channelNames.join(", ")}` : ""}`}
          >
            {birthAlias.name}
          </span>
        )}
        {visibleOthers.map((a, i) => (
          <span key={a.id}>
            {(i > 0 || birthAlias) && <span className="text-white/20">{" · "}</span>}
            <span
              className="hover:text-foreground transition-colors cursor-default"
              title={a.channelNames.length > 0 ? `Used on: ${a.channelNames.join(", ")}` : undefined}
            >
              {a.name}
              {a.usageCount > 0 && <span className="text-muted-foreground/50"> ({a.usageCount})</span>}
            </span>
          </span>
        ))}
        {overflow > 0 && (
          <>
            {" "}
            <button
              type="button"
              onClick={onAliasesBadgeClick}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[10px] text-muted-foreground/60 hover:bg-white/10 hover:text-foreground transition-colors align-baseline"
            >
              +{overflow}
            </button>
          </>
        )}
      </div>

      {/* Nationality / sex / birthdate */}
      <div className="mt-1.5 min-h-[20px] flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {person.nationality && (
          <span className="flex items-center gap-1.5">
            <FlagImage code={person.nationality} size={16} />
            {findCountryByCode(person.nationality)?.name ?? person.nationality}
          </span>
        )}
        {person.sexAtBirth && (
          <span>{person.sexAtBirth === "female" ? "\u2640" : person.sexAtBirth === "male" ? "\u2642" : ""}</span>
        )}
        {person.birthdate && (
          <span>{formatDateDMY(person.birthdate, person.birthdatePrecision)}</span>
        )}
      </div>

      {/* Age / status */}
      <div className="mt-1 min-h-[20px] flex flex-wrap items-center gap-x-3 gap-y-1">
        {age !== null && (
          <span className="text-sm text-muted-foreground">{age} yrs</span>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_DOT_COLORS[person.status])} />
          {STATUS_LABELS[person.status]}
        </span>
      </div>

      {/* Career timeline */}
      {(person.activeFrom || earliestSessionYear) && (
        <CareerTimeline
          activeFrom={person.activeFrom}
          retiredAt={person.retiredAt}
          birthYear={person.birthdate ? person.birthdate.getUTCFullYear() : null}
          earliestSessionYear={earliestSessionYear ?? null}
        />
      )}
    </>
  );

  if (section === "top") return <div>{topSection}</div>;
  if (section === "bottom") return <div>{bottomSection}</div>;

  return (
    <div className="flex flex-col">
      {topSection}
      <div className="border-t border-white/10 my-1.5" />
      {bottomSection}
    </div>
  );
}

// ── Hero Density Layout ─────────────────────────────────────────────────────

function HeroDensityLayout(props: HeroSharedProps) {
  const { layout } = useHeroLayout();
  const cfg = DENSITY_CONFIGS[layout];
  const { person, currentState, photos, profileLabels, kpiCounts, calculatedPgrade, meanWcp, displayName, initials, age, heroAliases, referenceSessionId, headshotSlotMap, plausibilityCount } = props;

  const handleAssignHeadshot = useCallback(
    async (mediaItemId: string, slot: number) => {
      await assignHeadshotSlotAction(person.id, mediaItemId, slot);
    },
    [person.id],
  );

  const handleRemoveHeadshot = useCallback(
    async (mediaItemId: string) => {
      await removeHeadshotSlotAction(person.id, mediaItemId);
    },
    [person.id],
  );

  const handleFindSimilar = useCallback((mediaItemId: string) => {
    window.open(`/media/similar?id=${mediaItemId}`, "_blank");
  }, []);

  return (
    <div className={cn("rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm", cfg.cardPadding)}>
      <div className={cn("flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left", cfg.cardGap)}>
        {/* Zone 1: Photo */}
        <CarouselHeader
          items={photos}
          fallbackInitials={initials}
          width={cfg.photoWidth}
          height={cfg.photoHeight}
          sessionId={referenceSessionId}
          onAssignHeadshot={handleAssignHeadshot}
          onRemoveHeadshot={handleRemoveHeadshot}
          profileLabels={profileLabels}
          headshotSlotMap={headshotSlotMap}
          onFindSimilar={handleFindSimilar}
        />

        {/* Zones 2+3: Identity | Physical — 2-col grid, no hairline */}
        <div className="hidden sm:grid flex-1 min-w-0 grid-cols-[auto_1fr] grid-rows-[auto_1fr] items-stretch">
          {/* Row 1, Col 1: Name + ICG ID */}
          <div className="flex items-end pb-1.5">
            <IdentityBlock
              person={person}
              displayName={displayName}
              age={age}
              heroAliases={heroAliases}
              onAliasesBadgeClick={props.onAliasesBadgeClick}
              nameSize={cfg.nameSize}
              earliestSessionYear={props.earliestSessionYear}
              referenceSessionId={props.referenceSessionId}
              refMediaCount={props.refMediaCount}
              plausibilityCount={plausibilityCount}
              section="top"
            />
          </div>
          {/* Rows 1-2, Col 2: Physical stats (single continuous panel) */}
          <div className={cn("row-span-2 rounded-lg bg-white/[0.02] px-4 py-2 ml-4 border-l border-white/8 flex flex-col", cfg.fieldGap)}>
            <PhysicalMetrics
              person={person}
              currentState={currentState}
              labelWidth={cfg.labelWidth}
              fieldGap={cfg.fieldGap}
            />
            <PhysicalDescriptive
              person={person}
              currentState={currentState}
              labelWidth={cfg.labelWidth}
              fieldGap={cfg.fieldGap}
            />
            <EntityPills currentState={currentState} onAppearanceClick={props.onAppearanceClick} />
          </div>

          {/* Row 2, Col 1: Aliases + demographics + career */}
          <div className="flex items-start pt-1.5">
            <IdentityBlock
              person={person}
              displayName={displayName}
              age={age}
              heroAliases={heroAliases}
              onAliasesBadgeClick={props.onAliasesBadgeClick}
              nameSize={cfg.nameSize}
              earliestSessionYear={props.earliestSessionYear}
              referenceSessionId={props.referenceSessionId}
              refMediaCount={props.refMediaCount}
              plausibilityCount={plausibilityCount}
              section="bottom"
            />
          </div>
        </div>

        {/* Mobile fallback: stacked layout */}
        <div className="sm:hidden w-full space-y-3">
          <IdentityBlock
            person={person}
            displayName={displayName}
            age={age}
            heroAliases={heroAliases}
            onAliasesBadgeClick={props.onAliasesBadgeClick}
            nameSize={cfg.nameSize}
            earliestSessionYear={props.earliestSessionYear}
            referenceSessionId={props.referenceSessionId}
            refMediaCount={props.refMediaCount}
            plausibilityCount={plausibilityCount}
            section="all"
          />
          <div className="rounded-lg bg-white/[0.02] px-4 py-1">
            <PhysicalMetrics person={person} currentState={currentState} labelWidth={cfg.labelWidth} fieldGap={cfg.fieldGap} />
            <div className="border-t border-white/10 my-1.5" />
            <PhysicalDescriptive person={person} currentState={currentState} labelWidth={cfg.labelWidth} fieldGap={cfg.fieldGap} />
            <EntityPills currentState={currentState} onAppearanceClick={props.onAppearanceClick} />
          </div>
        </div>

        {/* Divider 3|4 */}
        <div className="hidden sm:block w-px self-stretch bg-white/10 [mask-image:linear-gradient(to_bottom,transparent,white_20%,white_80%,transparent)]" />

        {/* Zone 4: KPI Panel */}
        <div className={cn("w-full sm:shrink-0 px-2", cfg.kpiWidth)}>
          <KpiStatsPanel person={person} kpiCounts={kpiCounts} calculatedPgrade={calculatedPgrade} meanWcp={meanWcp} />
        </div>
      </div>
    </div>
  );
}

// ── Hero Card Dispatcher ────────────────────────────────────────────────────

function HeroCard({
  person,
  currentState,
  photos,
  profileLabels,
  kpiCounts,
  calculatedPgrade,
  meanWcp,
  referenceSessionId,
  refMediaCount,
  headshotSlotMap,
  earliestSessionYear,
  onAliasesBadgeClick,
  onAppearanceClick,
  aliasesWithChannels,
  plausibilityCount = 0,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  photos: GalleryItem[];
  profileLabels: ProfileImageLabel[];
  kpiCounts: KpiCounts;
  calculatedPgrade?: number | null;
  meanWcp?: number | null;
  referenceSessionId?: string;
  refMediaCount?: number;
  headshotSlotMap?: Map<string, number>;
  earliestSessionYear?: number | null;
  onAliasesBadgeClick?: () => void;
  onAppearanceClick?: () => void;
  aliasesWithChannels?: PersonAliasWithChannels[];
  plausibilityCount?: number;
}) {
  const commonAlias = person.aliases.find((a) => a.isCommon);

  const displayName = commonAlias ? commonAlias.name : person.icgId;
  const initials = commonAlias
    ? commonAlias.name.charAt(0).toUpperCase()
    : person.icgId.charAt(0).toUpperCase();

  const age = person.birthdate ? computeAge(new Date(person.birthdate)) : null;

  // Build hero alias summaries from aliasesWithChannels (rich data) or fall back to person.aliases
  const heroAliases: HeroAliasSummary[] = useMemo(() => {
    if (aliasesWithChannels && aliasesWithChannels.length > 0) {
      return aliasesWithChannels
        .map((a) => ({
          id: a.id,
          name: a.name,
          isCommon: a.isCommon,
          isBirth: a.isBirth,
          usageCount: a.channelLinks.length,
          channelNames: a.channelLinks.map((cl) => cl.channelName),
        }))
        .sort((a, b) => {
          // birth first, then common, then plain aliases by usage desc
          const rank = (x: HeroAliasSummary) => (x.isBirth ? 0 : x.isCommon ? 1 : 2);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return b.usageCount - a.usageCount;
        });
    }
    // Fallback: use person.aliases (no channel data)
    return person.aliases.map((a) => ({
      id: a.id,
      name: a.name,
      isCommon: a.isCommon,
      isBirth: a.isBirth,
      usageCount: 0,
      channelNames: [],
    }));
  }, [aliasesWithChannels, person.aliases]);

  const sharedProps: HeroSharedProps = {
    person,
    currentState,
    photos,
    profileLabels,
    kpiCounts,
    calculatedPgrade,
    meanWcp,
    displayName,
    initials,
    age,
    referenceSessionId,
    refMediaCount,
    headshotSlotMap,
    earliestSessionYear,
    heroAliases,
    onAliasesBadgeClick,
    onAppearanceClick,
    plausibilityCount,
  };

  return <HeroDensityLayout {...sharedProps} />;
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function AboutCard({ person, referencePhotos }: { person: PersonData; referencePhotos?: GalleryItem[] }) {
  const [editing, setEditing] = useState(false);
  const [savedBio, setSavedBio] = useState(person.bio ?? "");
  const [draft, setDraft] = useState(person.bio ?? "");
  const [isPending, startTransition] = useTransition();
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  const displayName = person.aliases.find((a) => a.isCommon)?.name ?? person.icgId;
  const photos = useMemo(() => referencePhotos ?? [], [referencePhotos]);

  // Build a lookup map for media: references → actual URLs
  const mediaUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos) {
      const url = p.urls.gallery_512 ?? p.urls.original;
      if (url) map.set(p.id, url);
    }
    return map;
  }, [photos]);

  function insertPhoto(mediaId: string) {
    const tag = `![w150](media:${mediaId})`;
    setDraft((prev) => prev ? `${prev}\n${tag}` : tag);
    setShowPhotoPicker(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updatePersonBio(person.id, draft);
      if (result.success) {
        setSavedBio(draft);
      }
      setEditing(false);
    });
  }

  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: React.ReactNode }) => <p className="text-base font-bold text-foreground mb-1">{children}</p>,
    h2: ({ children }: { children?: React.ReactNode }) => <p className="text-sm font-semibold text-foreground mb-1">{children}</p>,
    h3: ({ children }: { children?: React.ReactNode }) => <p className="text-sm font-medium text-foreground mb-0.5">{children}</p>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">{children}</ol>,
    a: ({ children }: { href?: string; children?: React.ReactNode }) => <span className="text-primary underline">{children}</span>,
    img: ({ src, alt }: { src?: string | Blob; alt?: string }) => {
      if (!src || typeof src !== "string") return null;
      // Only allow media: references from reference session photos
      if (!src.startsWith("media:")) return null;
      const mediaId = src.slice(6);
      const resolved = mediaUrlMap.get(mediaId);
      if (!resolved) return null;
      // Parse alt text: "w150 left", "w80 right", "w200 inline", "w300"
      const altStr = alt ?? "";
      const tokens = altStr.split(/\s+/);
      const wToken = tokens.find((t) => /^w\d+$/.test(t));
      const width = wToken ? parseInt(wToken.slice(1), 10)
        : tokens.includes("small") ? 200
        : tokens.includes("large") ? 600
        : 150;
      const float = tokens.includes("right") ? "right"
        : tokens.includes("inline") ? "inline"
        : "left"; // default
      const floatStyle: React.CSSProperties = float === "left"
        ? { width: `${width}px`, height: "auto", float: "left", marginRight: "12px", marginBottom: "8px", marginTop: "4px" }
        : float === "right"
        ? { width: `${width}px`, height: "auto", float: "right", marginLeft: "12px", marginBottom: "8px", marginTop: "4px" }
        : { width: `${width}px`, height: "auto", display: "inline-block", verticalAlign: "middle", margin: "0 4px" };
      return (
        <NextImage
          src={resolved}
          alt=""
          width={width}
          height={Math.round(width * 0.75)}
          style={floatStyle}
          className="rounded-lg"
          unoptimized
        />
      );
    },
  }), [mediaUrlMap]);

  return (
    <SectionCard
      title={`About ${displayName}`}
      icon={<Info size={18} />}
      className="md:col-span-2"
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => { setDraft(savedBio); setEditing(true); }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(20, Math.max(6, draft.split("\n").length + 2))}
            className="w-full resize-y rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Write a bio... (supports **bold**, *italic*, # headings, - lists)"
          />
          {/* Photo picker */}
          {showPhotoPicker && photos.length > 0 && (
            <div className="rounded-lg border border-white/15 bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Insert photo from reference session</p>
              <div className="flex flex-wrap gap-1.5">
                {photos.map((photo) => {
                  const thumbUrl = photo.urls.gallery_512 ?? photo.urls.original;
                  return thumbUrl ? (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => insertPhoto(photo.id)}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 transition-all hover:border-primary hover:ring-1 hover:ring-primary"
                    >
                      <NextImage src={thumbUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPhotoPicker((v) => !v)}
                className={cn(
                  "ml-auto flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  showPhotoPicker
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/15 text-muted-foreground hover:text-foreground"
                )}
              >
                <ImageIcon size={12} /> Photo
              </button>
            )}
          </div>
        </div>
      ) : savedBio ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setDraft(savedBio); setEditing(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setDraft(savedBio); setEditing(true); } }}
          className="w-full text-left text-sm leading-relaxed text-muted-foreground rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-muted/30 cursor-text"
        >
          <ReactMarkdown
            components={markdownComponents}
            urlTransform={(url) => url}
          >
            {savedBio}
          </ReactMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-muted-foreground/50 italic hover:text-muted-foreground transition-colors"
        >
          Add a bio...
        </button>
      )}
    </SectionCard>
  );
}

function DataQualityBanner({ issues, onTabSwitch, onEditPerson }: { issues: PlausibilityIssue[]; onTabSwitch?: (tab: string) => void; onEditPerson?: () => void }) {
  if (issues.length === 0) return null;

  return (
    <div className="md:col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-amber-500">
          <AlertTriangle size={14} />
          <span>{issues.length} data quality {issues.length === 1 ? "issue" : "issues"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {issues.map((issue) => {
            const canFix = (issue.fixTab && onTabSwitch) || (issue.fixAction === "edit-person" && onEditPerson);
            return (
              <div key={issue.id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {issue.severity === "warning"
                  ? <AlertTriangle size={12} className="shrink-0 text-amber-500/70" />
                  : <Info size={12} className="shrink-0 text-blue-400/70" />
                }
                <span>{issue.message}</span>
                {canFix && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      if (issue.fixAction === "edit-person" && onEditPerson) onEditPerson();
                      else if (issue.fixTab && onTabSwitch) onTabSwitch(issue.fixTab);
                    }}
                  >
                    Fix
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  person,
  currentState,
  sessionWorkHistory,
  referencePhotos,
  plausibilityIssues = [],
  onTabSwitch,
  entityTags = [],
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  sessionWorkHistory?: PersonSessionWorkEntry[];
  referencePhotos?: GalleryItem[];
  plausibilityIssues?: PlausibilityIssue[];
  onTabSwitch?: (tab: string) => void;
  entityTags?: { id: string; name: string; group: { name: string; color: string } }[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasDigitalIdentities = currentState.activeDigitalIdentities.length > 0;
  const [tagIds, setTagIds] = useState(entityTags.map((t) => t.id));
  const hasHistory = person.personas.length > 0;
  const recentWork = (sessionWorkHistory ?? []).slice(0, 3);
  const recentPhotos = (referencePhotos ?? []).slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* 1. Data Quality */}
      <DataQualityBanner
        issues={plausibilityIssues}
        onTabSwitch={onTabSwitch}
        onEditPerson={() => {
          // Click the page-level Edit button to open EditPersonSheet
          const editBtn = document.querySelector<HTMLButtonElement>("[data-edit-person-trigger]");
          editBtn?.click();
        }}
      />

      {/* 2. About */}
      <AboutCard person={person} referencePhotos={referencePhotos} />

      {/* 3. Recent Work | Recent Photos */}
      {recentWork.length > 0 && (
        <SectionCard title="Recent Work" icon={<Film size={18} />} badge={recentWork.length}>
          <div className="space-y-2">
            {recentWork.map((entry) => (
              <Link
                key={entry.sessionId}
                href={`/sessions/${entry.sessionId}`}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/30 p-2.5 transition-colors hover:border-white/20 hover:bg-card/50"
              >
                {entry.thumbnails[0] && (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <NextImage src={entry.thumbnails[0].url} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.sessionName}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.labelName && <span>{entry.labelName}</span>}
                    {entry.sessionDate && <span> · {formatPartialDate(entry.sessionDate, entry.sessionDatePrecision)}</span>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {recentPhotos.length > 0 && (
        <SectionCard title="Recent Photos" icon={<ImageIcon size={18} />} badge={recentPhotos.length}>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {recentPhotos.map((photo, idx) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 transition-all hover:border-white/25"
              >
                <NextImage src={photo.urls.gallery_512 ?? photo.urls.original} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
              </button>
            ))}
          </div>
          {lightboxIndex !== null && (
            <GalleryLightbox
              items={recentPhotos}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </SectionCard>
      )}

      {/* 3. History — default collapsed */}
      {hasHistory && (
        <SectionCard
          title="History"
          icon={<Users size={18} />}
          badge={person.personas.length}
          className="md:col-span-2"
        >
          <HistoryPanel personas={person.personas} personId={person.id} currentState={currentState} />
        </SectionCard>
      )}

      {/* 5. Digital Identities | Notes & Tags */}
      {hasDigitalIdentities && (
        <SectionCard
          title="Digital Identities"
          icon={<Cpu size={18} />}
          badge={currentState.activeDigitalIdentities.length}
        >
          <div className="space-y-2">
            {currentState.activeDigitalIdentities.map((identity) => (
              <DigitalIdentityRow key={identity.id} identity={identity} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Notes & Tags" icon={<Tag size={18} />}>
        <div className="mb-3">
          <TagPicker
            scope="PERSON"
            selectedTagIds={tagIds}
            onChange={(newIds) => {
              setTagIds(newIds);
              setEntityTagsAction("PERSON", person.id, newIds);
            }}
            selectedTags={entityTags}
            placeholder="Add tags…"
            compact
          />
        </div>
        {person.notes && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {person.notes}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

// ── Career Tab ───────────────────────────────────────────────────────────────

function CareerTab({
  person,
  sessionWorkHistory,
  affiliations,
}: {
  person: PersonData;
  sessionWorkHistory: PersonSessionWorkEntry[];
  affiliations: PersonAffiliation[];
}) {
  // Derive affiliations from session work history
  const derivedAffiliations = useMemo(() => {
    if (affiliations.length > 0) return affiliations;
    const labelMap = new Map<string, PersonAffiliation>();
    for (const entry of sessionWorkHistory) {
      if (!entry.labelId || !entry.labelName) continue;
      const existing = labelMap.get(entry.labelId);
      if (existing) {
        existing.setCount++;
      } else {
        labelMap.set(entry.labelId, {
          labelId: entry.labelId,
          labelName: entry.labelName,
          setCount: 1,
        });
      }
    }
    return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
  }, [affiliations, sessionWorkHistory]);

  return (
    <div className="space-y-6">
      {/* Professional Summary */}
      {(person.activeFrom || person.specialization) && (
        <SectionCard title="Professional" icon={<Briefcase size={18} />}>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            {person.activeFrom && (
              <InfoRow label="Active from" value={formatDateDMY(person.activeFrom, person.activeFromPrecision)} />
            )}
            {person.retiredAt && (
              <InfoRow label="Retired" value={formatDateDMY(person.retiredAt, person.retiredAtPrecision)} />
            )}
            {person.specialization && (
              <InfoRow label="Specialization" value={person.specialization} />
            )}
          </dl>
        </SectionCard>
      )}

      {/* Session Work History */}
      <SectionCard
        title="Work History"
        icon={<Film size={18} />}
        badge={sessionWorkHistory.length}
      >
        {sessionWorkHistory.length === 0 ? (
          <EmptyState message="No work history recorded." />
        ) : (
          <CareerSessionList entries={sessionWorkHistory} />
        )}
      </SectionCard>

      {/* Label Affiliations */}
      <SectionCard
        title="Label Affiliations"
        icon={<Network size={18} />}
        badge={derivedAffiliations.length}
      >
        {derivedAffiliations.length === 0 ? (
          <EmptyState message="No label affiliations." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {derivedAffiliations.map((aff) => (
              <div
                key={aff.labelId}
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-card/50 px-3 py-2"
              >
                <Building2 size={14} className="text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">{aff.labelName}</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {aff.setCount}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Network Tab ──────────────────────────────────────────────────────────────

function NetworkTab({ connections }: { connections: PersonConnection[] }) {
  return (
    <SectionCard
      title="Connections"
      icon={<MapPin size={18} />}
      badge={connections.length}
    >
      {connections.length === 0 ? (
        <EmptyState message="No connections recorded." />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {connections.map((conn) => {
            const displayName = conn.commonAlias ?? conn.icgId;
            const initials = conn.commonAlias
              ? conn.commonAlias.charAt(0).toUpperCase()
              : conn.icgId.charAt(0).toUpperCase();
            return (
              <Link
                key={conn.personId}
                href={`/people/${conn.personId}`}
                className="group flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-primary">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conn.sharedSetCount} shared {conn.sharedSetCount === 1 ? "set" : "sets"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      SOURCE_STYLES[conn.source],
                    )}
                  >
                    {conn.source}
                  </span>
                  {conn.label && (
                    <span className="text-xs text-muted-foreground/70 italic">
                      {conn.label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ── Photos Tab ───────────────────────────────────────────────────────────────

function PhotosTab({
  person,
  photos,
  referenceSessionId,
  filledHeadshotSlots,
  profileLabels,
  headshotSlotEntries,
  productionSessions,
}: {
  person: PersonData;
  photos: GalleryItem[];
  referenceSessionId?: string;
  filledHeadshotSlots?: number[];
  profileLabels: ProfileImageLabel[];
  headshotSlotEntries?: HeadshotSlotEntry[];
  productionSessions: PersonProductionSession[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slotEntries, setSlotEntries] = useState(headshotSlotEntries ?? []);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const refPhotosContainerRef = useRef<HTMLDivElement>(null);

  // Drag-anywhere overlay for reference photos section
  useEffect(() => {
    const el = refPhotosContainerRef.current;
    if (!el) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes("Files")) setIsDragOver(true);
    }
    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    }
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer?.files.length) addFilesRef.current?.(e.dataTransfer.files);
    }

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, []);

  const indexMap = new Map<string, number>();
  photos.forEach((p, i) => indexMap.set(p.id, i));

  const totalProductionCount = productionSessions.reduce((sum, s) => sum + s.mediaCount, 0);

  // Build Map<mediaItemId, slot> from entries
  const headshotSlotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of slotEntries) {
      map.set(entry.mediaItemId, entry.slot);
    }
    return map;
  }, [slotEntries]);

  const handleAssignHeadshot = useCallback(
    async (mediaItemId: string, slot: number) => {
      // Optimistic update: remove old assignment for this slot, add new one
      setSlotEntries((prev) => [
        ...prev.filter((e) => e.slot !== slot && e.mediaItemId !== mediaItemId),
        { mediaItemId, slot },
      ]);
      await assignHeadshotSlotAction(person.id, mediaItemId, slot);
    },
    [person.id],
  );

  const handleRemoveHeadshot = useCallback(
    async (mediaItemId: string) => {
      setSlotEntries((prev) => prev.filter((e) => e.mediaItemId !== mediaItemId));
      await removeHeadshotSlotAction(person.id, mediaItemId);
    },
    [person.id],
  );

  const handleFindSimilar = useCallback((mediaItemId: string) => {
    window.open(`/media/similar?id=${mediaItemId}`, "_blank");
  }, []);

  return (
    <div className="space-y-6">
      {/* Reference Photos */}
      <div ref={refPhotosContainerRef} className="relative">
        <SectionCard
          title="Reference Photos"
          icon={<ImageIcon size={18} />}
          badge={photos.length}
          action={
            referenceSessionId ? (
              <button
                type="button"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(
                    'input[type="file"][accept*="image"]',
                  );
                  input?.click();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-card/60 text-muted-foreground transition-all hover:border-entity-person/30 hover:bg-entity-person/10 hover:text-entity-person focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Upload photos"
                title="Upload photos"
              >
                <Plus size={14} />
              </button>
            ) : undefined
          }
        >
          {photos.length === 0 ? (
            <EmptyState message="No reference photos uploaded yet." />
          ) : (
            <JustifiedGrid
              items={photos}
              onOpen={(id) => {
                const idx = indexMap.get(id);
                if (idx !== undefined) setLightboxIndex(idx);
              }}
            />
          )}
        </SectionCard>

        {/* Headless upload engine */}
        {referenceSessionId && (
          <BatchUploadZone
            sessionId={referenceSessionId}
            personId={person.id}
            filledHeadshotSlots={filledHeadshotSlots}
            totalHeadshotSlots={profileLabels.length || 5}
            hideDropzone
            addFilesRef={addFilesRef}
          />
        )}

        {/* Drag-anywhere overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-entity-person/50 bg-entity-person/5 backdrop-blur-[2px] transition-all">
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} className="text-entity-person/60" />
              <p className="text-sm font-medium text-entity-person/80">Drop to upload</p>
            </div>
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onAssignHeadshot={handleAssignHeadshot}
          onRemoveHeadshot={handleRemoveHeadshot}
          profileLabels={profileLabels}
          headshotSlotMap={headshotSlotMap}
          onFindSimilar={handleFindSimilar}
          sessionId={referenceSessionId}
        />
      )}

      {/* Production Photos */}
      <SectionCard
        title="Production Photos"
        icon={<Film size={18} />}
        badge={totalProductionCount}
      >
        {productionSessions.length === 0 ? (
          <EmptyState message="No production session photos." />
        ) : (
          <ProductionPhotoList sessions={productionSessions} />
        )}
      </SectionCard>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function PersonDetailTabs({
  person,
  currentState,
  workHistory,
  affiliations,
  connections,
  photos,
  profileLabels,
  referenceSessionId,
  filledHeadshotSlots,
  headshotSlotEntries,
  categories,
  categoryCounts,
  skillGroups,
  physicalAttributeGroups,
  calculatedPgrade,
  meanWcp,
  aliasesWithChannels,
  sessionWorkHistory,
  productionSessions,
  entityMedia,
  refMediaCount,
  plausibilityIssues = [],
  initialTab,
  entityTags = [],
}: PersonDetailTabsProps) {
  const VALID_TABS: Set<string> = useMemo(
    () => new Set<string>(["overview", "aliases", "appearance", "details", "skills", "career", "network", "photos"]),
    [],
  );
  const resolvedInitialTab: TabId = initialTab && VALID_TABS.has(initialTab)
    ? (initialTab as TabId)
    : "overview";
  const [activeTab, setActiveTabRaw] = useState<TabId>(resolvedInitialTab);

  // Sync active tab to URL search param (for BrowseNavBar tab preservation)
  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabRaw(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", url.toString());
  }, []);

  const heroHeadshotSlotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of headshotSlotEntries ?? []) {
      map.set(entry.mediaItemId, entry.slot);
    }
    return map;
  }, [headshotSlotEntries]);

  const aliasCount = person.aliases.length;

  const handleAliasesBadgeClick = useCallback(() => {
    setActiveTab("aliases");
  }, [setActiveTab]);

  const handleAppearanceClick = useCallback(() => {
    setActiveTab("appearance");
  }, [setActiveTab]);

  const earliestSessionYear = useMemo(() => {
    const entries = sessionWorkHistory ?? [];
    let min: number | null = null;
    for (const e of entries) {
      if (e.sessionDate) {
        const y = new Date(e.sessionDate).getUTCFullYear();
        if (min === null || y < min) min = y;
      }
    }
    return min;
  }, [sessionWorkHistory]);

  const tabs: { id: TabId; label: string; badge?: number; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    { id: "aliases", label: "Aliases", badge: aliasCount || undefined, icon: <BookUser size={14} /> },
    { id: "appearance", label: "Appearance", badge: (currentState.activeBodyMarks.length + currentState.activeBodyModifications.length + currentState.activeCosmeticProcedures.length) || undefined, icon: <Sparkles size={14} /> },
    ...(categories && categories.length > 0
      ? [{ id: "details" as TabId, label: "Details", badge: (categoryCounts?.filter((c) => c.count > 0).length) || undefined, icon: <FileImage size={14} /> }]
      : []),
    { id: "skills" as TabId, label: "Skills", badge: currentState.activeSkills.length || undefined, icon: <Zap size={14} /> },
    { id: "career", label: "Career", badge: (sessionWorkHistory?.length ?? workHistory.length) || undefined, icon: <Briefcase size={14} /> },
    { id: "network", label: "Network", badge: connections.length || undefined, icon: <Users size={14} /> },
    { id: "photos", label: "Photos", badge: (photos.length + (productionSessions?.reduce((sum, s) => sum + s.mediaCount, 0) ?? 0)) || undefined, icon: <ImageIcon size={14} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <HeroCard
        person={person}
        currentState={currentState}
        photos={photos}
        profileLabels={profileLabels}
        referenceSessionId={referenceSessionId}
        refMediaCount={refMediaCount}
        headshotSlotMap={heroHeadshotSlotMap}
        calculatedPgrade={calculatedPgrade}
        meanWcp={meanWcp}
        kpiCounts={{
          sets: sessionWorkHistory?.length ?? workHistory.length,
          labels: affiliations.length,
          photos: photos.length + (productionSessions?.reduce((sum, s) => sum + s.mediaCount, 0) ?? 0),
          connections: connections.length,
        }}
        earliestSessionYear={earliestSessionYear}
        onAliasesBadgeClick={handleAliasesBadgeClick}
        onAppearanceClick={handleAppearanceClick}
        aliasesWithChannels={aliasesWithChannels}
        plausibilityCount={plausibilityIssues.length}
      />

      {/* Tab bar — scrollable on mobile */}
      <div
        className="flex gap-1 overflow-x-auto rounded-xl border border-white/15 bg-card/50 p-1 scrollbar-none"
        role="tablist"
        aria-label="Person details"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="shrink-0" aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        id="tabpanel-overview"
        role="tabpanel"
        aria-labelledby="tab-overview"
        hidden={activeTab !== "overview"}
      >
        {activeTab === "overview" && (
          <OverviewTab
            person={person}
            currentState={currentState}
            sessionWorkHistory={sessionWorkHistory}
            referencePhotos={photos}
            plausibilityIssues={plausibilityIssues}
            onTabSwitch={(tab) => setActiveTab(tab as TabId)}
            entityTags={entityTags}
          />
        )}
      </div>
      <div
        id="tabpanel-aliases"
        role="tabpanel"
        aria-labelledby="tab-aliases"
        hidden={activeTab !== "aliases"}
      >
        {activeTab === "aliases" && (
          <PersonAliasesTab
            personId={person.id}
            aliases={aliasesWithChannels ?? []}
          />
        )}
      </div>
      <div
        id="tabpanel-appearance"
        role="tabpanel"
        aria-labelledby="tab-appearance"
        hidden={activeTab !== "appearance"}
      >
        {activeTab === "appearance" && (
          <AppearanceTab
            person={person}
            currentState={currentState}
            entityMedia={entityMedia}
            categories={categories}
            referenceSessionId={referenceSessionId}
            attributeGroups={physicalAttributeGroups}
          />
        )}
      </div>
      {categories && categories.length > 0 && (
        <div
          id="tabpanel-details"
          role="tabpanel"
          aria-labelledby="tab-details"
          hidden={activeTab !== "details"}
        >
          {activeTab === "details" && (
            <PersonDetailsTab
              personId={person.id}
              categories={categories}
              categoryCounts={categoryCounts ?? []}
              referenceSessionId={referenceSessionId}
              currentState={currentState}
            />
          )}
        </div>
      )}
      <div
        id="tabpanel-skills"
        role="tabpanel"
        aria-labelledby="tab-skills"
        hidden={activeTab !== "skills"}
      >
        {activeTab === "skills" && (
          <PersonSkillsTab
            personId={person.id}
            skills={currentState.activeSkills}
            skillGroups={skillGroups ?? []}
            personas={person.personas.map((p) => ({
              id: p.id,
              label: p.label,
            }))}
          />
        )}
      </div>
      <div
        id="tabpanel-career"
        role="tabpanel"
        aria-labelledby="tab-career"
        hidden={activeTab !== "career"}
      >
        {activeTab === "career" && (
          <CareerTab
            person={person}
            sessionWorkHistory={sessionWorkHistory ?? []}
            affiliations={affiliations}
          />
        )}
      </div>
      <div
        id="tabpanel-network"
        role="tabpanel"
        aria-labelledby="tab-network"
        hidden={activeTab !== "network"}
      >
        {activeTab === "network" && <NetworkTab connections={connections} />}
      </div>
      <div
        id="tabpanel-photos"
        role="tabpanel"
        aria-labelledby="tab-photos"
        hidden={activeTab !== "photos"}
      >
        {activeTab === "photos" && (
          <PhotosTab
            person={person}
            photos={photos}
            profileLabels={profileLabels}
            referenceSessionId={referenceSessionId}
            filledHeadshotSlots={filledHeadshotSlots}
            headshotSlotEntries={headshotSlotEntries}
            productionSessions={productionSessions ?? []}
          />
        )}
      </div>
    </div>
  );
}
