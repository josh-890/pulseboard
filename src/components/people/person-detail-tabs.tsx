"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  AliasType,
  PersonStatus,
  ContributionRole,
  SetType,
  RelationshipSource,
} from "@/lib/types";
import { PersonaTimelineEntry } from "@/components/people/persona-timeline-entry";
import { BodyMarkCard } from "@/components/people/body-mark-card";
import { DigitalIdentityRow } from "@/components/people/digital-identity-row";
import { SkillItem } from "@/components/people/skill-item";
import {
  Star,
  StarOff,
  BookUser,
  Fingerprint,
  Users,
  Film,
  Camera,
  Network,
  MapPin,
  Tag,
  Building2,
  Cpu,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { ImageGallery } from "@/components/photos/image-gallery";
import type { PhotoWithUrls } from "@/lib/types";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;
type PhotoProps = Omit<PhotoWithUrls, "variants">;

type PersonDetailTabsProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
  connections: PersonConnection[];
  photos: PhotoProps[];
};

// ── Style maps ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PersonStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  wishlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  archived: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

const ALIAS_TYPE_STYLES: Record<AliasType, string> = {
  common: "border-primary/30 bg-primary/10 text-primary",
  birth: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  alias: "border-white/15 bg-muted/50 text-foreground",
};

const ALIAS_TYPE_LABELS: Record<AliasType, string> = {
  common: "Common",
  birth: "Birth",
  alias: "Alias",
};

const ROLE_STYLES: Record<ContributionRole, string> = {
  main: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  supporting: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  background: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const ROLE_LABELS: Record<ContributionRole, string> = {
  main: "Main",
  supporting: "Supporting",
  background: "Background",
};

const SET_TYPE_STYLES: Record<SetType, string> = {
  photo: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  video: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
};

const SOURCE_STYLES: Record<RelationshipSource, string> = {
  derived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  manual: "bg-primary/15 text-primary border-primary/30",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground/70 italic">{message}</p>;
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < rating;
        return filled ? (
          <Star key={i} size={16} className="fill-amber-400 text-amber-400" aria-hidden="true" />
        ) : (
          <StarOff key={i} size={16} className="text-muted-foreground/30" aria-hidden="true" />
        );
      })}
    </div>
  );
}

function formatBirthdate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({
  person,
  currentState,
  workHistory,
  affiliations,
  connections,
  photos,
}: {
  person: PersonData;
  currentState: PersonCurrentState;
  workHistory: PersonWorkHistoryItem[];
  affiliations: PersonAffiliation[];
  connections: PersonConnection[];
  photos: PhotoProps[];
}) {
  const commonAlias = person.aliases.find((a) => a.type === "common");
  const birthAlias = person.aliases.find((a) => a.type === "birth");
  const otherAliases = person.aliases.filter((a) => !a.deletedAt && a.type === "alias");

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <SectionCard title="Basic Info" icon={<BookUser size={18} />}>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
          {person.birthdate && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Birthdate</dt>
              <dd className="font-medium">{formatBirthdate(person.birthdate)}</dd>
            </div>
          )}
          {person.sexAtBirth && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Sex at birth</dt>
              <dd className="font-medium capitalize">{person.sexAtBirth}</dd>
            </div>
          )}
          {person.birthPlace && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Birth place</dt>
              <dd className="font-medium">{person.birthPlace}</dd>
            </div>
          )}
          {person.nationality && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Nationality</dt>
              <dd className="font-medium">{person.nationality}</dd>
            </div>
          )}
          {person.ethnicity && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Ethnicity</dt>
              <dd className="font-medium">{person.ethnicity}</dd>
            </div>
          )}
          {person.location && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Location</dt>
              <dd className="font-medium">{person.location}</dd>
            </div>
          )}
          {birthAlias && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">Birth name</dt>
              <dd className="font-medium">{birthAlias.name}</dd>
            </div>
          )}
        </dl>
      </SectionCard>

      {/* Physical (static + computed current state) */}
      {(person.height || person.eyeColor || person.naturalHairColor || person.bodyType || person.measurements ||
        currentState.currentHairColor || currentState.weight || currentState.build || currentState.visionAids || currentState.fitnessLevel) && (
        <SectionCard title="Physical" icon={<Activity size={18} />}>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            {person.height && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Height</dt>
                <dd className="font-medium">{person.height} cm</dd>
              </div>
            )}
            {person.eyeColor && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Eye color</dt>
                <dd className="font-medium capitalize">{person.eyeColor}</dd>
              </div>
            )}
            {person.naturalHairColor && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Natural hair</dt>
                <dd className="font-medium capitalize">{person.naturalHairColor}</dd>
              </div>
            )}
            {person.bodyType && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Body type</dt>
                <dd className="font-medium capitalize">{person.bodyType}</dd>
              </div>
            )}
            {person.measurements && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Measurements</dt>
                <dd className="font-medium">{person.measurements}</dd>
              </div>
            )}
            {currentState.currentHairColor && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Current hair</dt>
                <dd className="font-medium capitalize">{currentState.currentHairColor}</dd>
              </div>
            )}
            {currentState.weight !== null && currentState.weight !== undefined && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Weight</dt>
                <dd className="font-medium">{currentState.weight} kg</dd>
              </div>
            )}
            {currentState.build && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Build</dt>
                <dd className="font-medium capitalize">{currentState.build}</dd>
              </div>
            )}
            {currentState.visionAids && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Vision aids</dt>
                <dd className="font-medium">{currentState.visionAids}</dd>
              </div>
            )}
            {currentState.fitnessLevel && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Fitness level</dt>
                <dd className="font-medium capitalize">{currentState.fitnessLevel}</dd>
              </div>
            )}
          </dl>
        </SectionCard>
      )}

      {/* Body Marks */}
      {currentState.activeBodyMarks.length > 0 && (
        <SectionCard
          title={`Body Marks (${currentState.activeBodyMarks.length})`}
          icon={<Fingerprint size={18} />}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {currentState.activeBodyMarks.map((mark) => (
              <BodyMarkCard key={mark.id} mark={mark} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Digital Identities */}
      {currentState.activeDigitalIdentities.length > 0 && (
        <SectionCard
          title={`Digital Identities (${currentState.activeDigitalIdentities.length})`}
          icon={<Cpu size={18} />}
        >
          <div className="space-y-2">
            {currentState.activeDigitalIdentities.map((identity) => (
              <DigitalIdentityRow key={identity.id} identity={identity} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Professional */}
      {(person.activeSince || person.specialization || currentState.activeSkills.length > 0) && (
        <SectionCard title="Professional" icon={<Tag size={18} />}>
          <dl className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            {person.activeSince && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Active since</dt>
                <dd className="font-medium">{person.activeSince}</dd>
              </div>
            )}
            {person.specialization && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">Specialization</dt>
                <dd className="font-medium">{person.specialization}</dd>
              </div>
            )}
          </dl>
          {currentState.activeSkills.length > 0 && (
            <div className="space-y-2">
              {currentState.activeSkills.map((skill) => (
                <SkillItem key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Aliases */}
      {(commonAlias || birthAlias || otherAliases.length > 0) && (
        <SectionCard title="Aliases" icon={<Fingerprint size={18} />}>
          <div className="flex flex-wrap gap-2">
            {person.aliases
              .filter((a) => !a.deletedAt)
              .map((alias) => (
                <div
                  key={alias.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                    ALIAS_TYPE_STYLES[alias.type],
                  )}
                >
                  {alias.type !== "alias" && (
                    <span className="text-xs font-medium opacity-70">
                      {ALIAS_TYPE_LABELS[alias.type]}
                    </span>
                  )}
                  {alias.name}
                </div>
              ))}
          </div>
        </SectionCard>
      )}

      {/* Notes & Tags */}
      {(person.notes || person.tags.length > 0 || person.rating !== null) && (
        <SectionCard title="Notes" icon={<Tag size={18} />}>
          {person.rating !== null && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rating</span>
              <StarRating rating={person.rating} />
              <span className="text-sm font-semibold">{person.rating}/5</span>
            </div>
          )}
          {person.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {person.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {person.notes && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {person.notes}
            </p>
          )}
        </SectionCard>
      )}

      {/* Photos */}
      <ImageGallery
        photos={photos as Parameters<typeof ImageGallery>[0]["photos"]}
        entityType="person"
        entityId={person.id}
      />

      {/* Work History */}
      <SectionCard
        title={`Work History${workHistory.length > 0 ? ` (${workHistory.length})` : ""}`}
        icon={<Film size={18} />}
      >
        {workHistory.length === 0 ? (
          <EmptyState message="No work history recorded." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 font-medium">Released</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {workHistory.map((item) => (
                  <tr key={item.setId} className="group transition-colors hover:bg-white/5">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/sets/${item.setId}`}
                        className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {item.setTitle}
                      </Link>
                      {item.projectName && (
                        <p className="text-xs text-muted-foreground">{item.projectName}</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          SET_TYPE_STYLES[item.setType],
                        )}
                      >
                        {item.setType === "photo" ? (
                          <Camera size={10} className="mr-1" />
                        ) : (
                          <Film size={10} className="mr-1" />
                        )}
                        {item.setType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          ROLE_STYLES[item.role],
                        )}
                      >
                        {ROLE_LABELS[item.role]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {item.labelName ?? <span className="opacity-40">—</span>}
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                      {item.releaseDate ? (
                        formatReleaseDate(item.releaseDate)
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Affiliations */}
      <SectionCard
        title={`Label Affiliations${affiliations.length > 0 ? ` (${affiliations.length})` : ""}`}
        icon={<Network size={18} />}
      >
        {affiliations.length === 0 ? (
          <EmptyState message="No label affiliations." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {affiliations.map((aff) => (
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

      {/* Connections */}
      <SectionCard
        title={`Connections${connections.length > 0 ? ` (${connections.length})` : ""}`}
        icon={<MapPin size={18} />}
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
    </div>
  );
}

// ── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ person }: { person: PersonData }) {
  const visiblePersonas = person.personas.filter((p) => !p.deletedAt);

  if (visiblePersonas.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <p className="text-sm text-muted-foreground/70 italic">No history recorded.</p>
      </div>
    );
  }

  return (
    <SectionCard title="Persona Timeline" icon={<Users size={18} />}>
      <div className="relative space-y-4">
        {/* Vertical line */}
        <div
          className="absolute left-1.5 top-3 bottom-3 w-px bg-white/10"
          aria-hidden="true"
        />
        {visiblePersonas.map((persona) => (
          <PersonaTimelineEntry key={persona.id} persona={persona} />
        ))}
      </div>
    </SectionCard>
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
}: PersonDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "history">("profile");

  const commonAlias = person.aliases.find((a) => a.type === "common");
  const displayName = commonAlias ? `${commonAlias.name} (${person.icgId})` : person.icgId;
  const initials = commonAlias
    ? commonAlias.name.charAt(0).toUpperCase()
    : person.icgId.charAt(0).toUpperCase();

  const tabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "history" as const, label: "History" },
  ];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/15 text-3xl font-bold text-primary ring-4 ring-primary/20"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  STATUS_STYLES[person.status],
                )}
              >
                {STATUS_LABELS[person.status]}
              </span>
              {person.rating !== null && <StarRating rating={person.rating} />}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-xl border border-white/15 bg-card/50 p-1"
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
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        id="tabpanel-profile"
        role="tabpanel"
        aria-labelledby="tab-profile"
        hidden={activeTab !== "profile"}
      >
        {activeTab === "profile" && (
          <ProfileTab
            person={person}
            currentState={currentState}
            workHistory={workHistory}
            affiliations={affiliations}
            connections={connections}
            photos={photos}
          />
        )}
      </div>
      <div
        id="tabpanel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        hidden={activeTab !== "history"}
      >
        {activeTab === "history" && <HistoryTab person={person} />}
      </div>
    </div>
  );
}
