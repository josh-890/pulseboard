"use client";

import { useState, useTransition, useCallback } from "react";
import Image from "next/image";
import { X, ChevronDown, ChevronRight, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
} from "@/lib/constants/skill";
import {
  addContributionSkillAction,
  removeContributionSkillAction,
  updateContributionSkillLevelAction,
  addMediaToContributionSkillAction,
  removeMediaFromContributionSkillAction,
} from "@/lib/actions/contribution-actions";
import { SkillEventMediaPicker } from "@/components/people/skill-event-media-picker";
import { SkillCombobox } from "@/components/skills/skill-combobox";
import type { SkillDefOption } from "@/components/skills/skill-combobox";
import type { EnrichedContribution } from "@/lib/services/contribution-service";

// ─── Types ──────────────────────────────────────────────────────────────────

type ContributionSkillEntry = EnrichedContribution["skills"][number];

type SkillGroupOption = {
  id: string;
  name: string;
  definitions: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    pgrade: number | null;
    defaultLevel: SkillLevel | null;
  }[];
};

type SkillMediaItem = {
  id: string;
  thumbUrl: string;
};

type SessionContributionSkillsProps = {
  sessionId: string;
  contributions: EnrichedContribution[];
  skillGroups: SkillGroupOption[];
  skillMedia?: Record<string, SkillMediaItem[]>;
};

// ─── Grouped display ────────────────────────────────────────────────────────

type GroupedByPerson = {
  personId: string;
  displayName: string;
  contributions: {
    contribution: EnrichedContribution;
    roleName: string;
  }[];
};

function groupByPerson(contributions: EnrichedContribution[]): GroupedByPerson[] {
  const map = new Map<string, GroupedByPerson>();
  for (const c of contributions) {
    const displayName = c.person.aliases[0]?.name ?? c.person.icgId;
    if (!map.has(c.personId)) {
      map.set(c.personId, { personId: c.personId, displayName, contributions: [] });
    }
    map.get(c.personId)!.contributions.push({
      contribution: c,
      roleName: c.roleDefinition.name,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

// ─── Level Popover ──────────────────────────────────────────────────────────

type LevelPopoverProps = {
  currentLevel: SkillLevel | null;
  onSelect: (level: SkillLevel | null) => void;
  onClose: () => void;
};

function LevelPopover({ currentLevel, onSelect, onClose }: LevelPopoverProps) {
  return (
    <div className="absolute top-full left-0 z-20 mt-1 rounded-lg border border-white/15 bg-background/95 p-2 shadow-xl backdrop-blur-sm">
      <div className="flex flex-wrap gap-1.5">
        {SKILL_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              onSelect(currentLevel === l ? null : l);
              onClose();
            }}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all",
              currentLevel === l
                ? SKILL_LEVEL_STYLES[l]
                : "border-white/15 text-muted-foreground hover:border-white/30",
            )}
          >
            {SKILL_LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Skill Card ─────────────────────────────────────────────────────────────

type ContributionSkillCardProps = {
  skill: ContributionSkillEntry;
  sessionId: string;
  isPending: boolean;
  onRemove: (contributionSkillId: string) => void;
  mediaItems?: SkillMediaItem[];
};

function ContributionSkillCard({
  skill,
  sessionId,
  isPending,
  onRemove,
  mediaItems = [],
}: ContributionSkillCardProps) {
  const [levelPopoverOpen, setLevelPopoverOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleLevelChange = useCallback(
    (newLevel: SkillLevel | null) => {
      startTransition(async () => {
        const result = await updateContributionSkillLevelAction(
          skill.id,
          sessionId,
          newLevel,
        );
        if (!result.success) {
          toast.error(result.error ?? "Failed to update level");
        }
      });
    },
    [skill.id, sessionId],
  );

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("application/x-media-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    const currentTarget = e.currentTarget as HTMLElement;
    if (currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const mediaId = e.dataTransfer.getData("application/x-media-id");
    if (!mediaId) return;

    startTransition(async () => {
      const result = await addMediaToContributionSkillAction(
        skill.id,
        [mediaId],
        sessionId,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to link media");
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/40 p-3 transition-all",
        dragOver
          ? "border-dashed border-primary bg-primary/5"
          : "border-white/15",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground/70">
          {skill.skillDefinition.group.name}
        </span>
        <span className="text-sm font-medium text-foreground/90">
          {skill.skillDefinition.name}
        </span>

        {/* Level badge (clickable) */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setLevelPopoverOpen(!levelPopoverOpen)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium transition-all",
              skill.level
                ? SKILL_LEVEL_STYLES[skill.level]
                : "border-white/15 text-muted-foreground hover:border-white/30",
            )}
          >
            {skill.level ? SKILL_LEVEL_LABEL[skill.level] : "No level"}
            <span className="ml-1 text-[10px]">&#9662;</span>
          </button>
          {levelPopoverOpen && (
            <LevelPopover
              currentLevel={skill.level}
              onSelect={handleLevelChange}
              onClose={() => setLevelPopoverOpen(false)}
            />
          )}
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(skill.id)}
          disabled={isPending}
          className="rounded-full p-1 text-muted-foreground/50 transition-all hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Remove ${skill.skillDefinition.name}`}
        >
          <X size={12} />
        </button>
      </div>

      {/* Media row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {mediaItems.map((m) => (
          <div
            key={m.id}
            className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/15 bg-muted/30"
          >
            <Image
              src={m.thumbUrl}
              alt=""
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMediaPickerOpen(true)}
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-white/20 text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground"
          aria-label="Add media"
        >
          <ImagePlus size={18} />
        </button>
      </div>

      {/* Drop hint */}
      {dragOver && (
        <p className="mt-1.5 text-center text-xs text-primary/70">
          Drop to link media
        </p>
      )}

      {/* Media picker sheet */}
      {mediaPickerOpen && (
        <SkillEventMediaPicker
          eventId={skill.id}
          sessionId={sessionId}
          personId=""
          existingMediaIds={mediaItems.map((m) => m.id)}
          onClose={() => setMediaPickerOpen(false)}
          onAddMedia={async (mediaItemIds) =>
            addMediaToContributionSkillAction(skill.id, mediaItemIds, sessionId)
          }
          onRemoveMedia={async (mediaItemId) =>
            removeMediaFromContributionSkillAction(skill.id, mediaItemId, sessionId)
          }
        />
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SessionContributionSkills({
  sessionId,
  contributions,
  skillGroups,
  skillMedia = {},
}: SessionContributionSkillsProps) {
  const [isPending, startTransition] = useTransition();
  const grouped = groupByPerson(contributions);
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(
    () => new Set(grouped.map((g) => g.personId)),
  );

  const totalSkills = contributions.reduce((acc, c) => acc + c.skills.length, 0);

  function togglePerson(personId: string) {
    setExpandedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function handleRemove(contributionSkillId: string) {
    startTransition(async () => {
      const result = await removeContributionSkillAction(
        contributionSkillId,
        sessionId,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove skill");
      }
    });
  }

  function handleAutoAdd(contributionId: string, skillDef: SkillDefOption) {
    startTransition(async () => {
      const result = await addContributionSkillAction(
        contributionId,
        skillDef.id,
        sessionId,
        skillDef.defaultLevel ?? null,
        null,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to add skill");
      }
    });
  }

  return (
    <div>
      {/* Grouped skill list */}
      {totalSkills === 0 && contributions.length === 0 ? (
        <p className="text-sm italic text-muted-foreground/70">
          No contribution skills recorded for this session.
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map((group) => (
            <div key={group.personId}>
              <button
                type="button"
                onClick={() => togglePerson(group.personId)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-card/60"
              >
                {expandedPersons.has(group.personId) ? (
                  <ChevronDown size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronRight size={14} className="text-muted-foreground" />
                )}
                <span>{group.displayName}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {group.contributions.reduce((acc, c) => acc + c.contribution.skills.length, 0)}{" "}
                  skills
                </span>
              </button>

              {expandedPersons.has(group.personId) && (
                <div className="ml-6 mt-1 space-y-3">
                  {group.contributions.map(({ contribution, roleName }) => {
                    const assignedSkillIds = new Set(
                      contribution.skills.map((s) => s.skillDefinitionId),
                    );
                    return (
                      <div key={contribution.id}>
                        <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground mb-1">
                          {roleName}
                        </span>
                        <div className="space-y-2">
                          {contribution.skills.map((skill) => (
                            <ContributionSkillCard
                              key={skill.id}
                              skill={skill}
                              sessionId={sessionId}
                              isPending={isPending}
                              onRemove={handleRemove}
                              mediaItems={skillMedia[skill.id]}
                            />
                          ))}
                        </div>
                        <SkillCombobox
                          skillGroups={skillGroups}
                          assignedSkillIds={assignedSkillIds}
                          onSelect={(def) => handleAutoAdd(contribution.id, def)}
                          isPending={isPending}
                          triggerClassName="mt-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
