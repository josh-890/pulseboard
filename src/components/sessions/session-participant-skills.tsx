"use client";

import { useState, useTransition, useCallback } from "react";
import { Plus, X, ChevronDown, ChevronRight, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
} from "@/lib/constants/skill";
import {
  removeSessionParticipantSkillAction,
  updateSessionSkillLevelAction,
  addMediaToSessionSkillAction,
  removeMediaFromSessionSkillAction,
} from "@/lib/actions/skill-actions";
import { AddSessionSkillSheet } from "./add-session-skill-sheet";
import { SkillEventMediaPicker } from "@/components/people/skill-event-media-picker";

// ─── Types ──────────────────────────────────────────────────────────────────

type ParticipantSkillEntry = {
  sessionId: string;
  personId: string;
  skillDefinitionId: string;
  level: SkillLevel | null;
  notes: string | null;
  person: {
    id: string;
    icgId: string;
    aliases: { name: string }[];
  };
  skillDefinition: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    pgrade: number | null;
    defaultLevel: SkillLevel | null;
    group: { name: string };
  };
  demonstratedEventId: string | null;
  eventMedia: { id: string; thumbUrl: string }[];
};

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

type SessionParticipantSkillsProps = {
  sessionId: string;
  entries: ParticipantSkillEntry[];
  skillGroups: SkillGroupOption[];
  participants: { personId: string; displayName: string }[];
};

// ─── Grouped display ────────────────────────────────────────────────────────

type GroupedByPerson = {
  personId: string;
  displayName: string;
  skills: ParticipantSkillEntry[];
};

function groupByPerson(entries: ParticipantSkillEntry[]): GroupedByPerson[] {
  const map = new Map<string, GroupedByPerson>();
  for (const e of entries) {
    const displayName = e.person.aliases[0]?.name ?? e.person.icgId;
    if (!map.has(e.personId)) {
      map.set(e.personId, { personId: e.personId, displayName, skills: [] });
    }
    map.get(e.personId)!.skills.push(e);
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

type SessionSkillCardProps = {
  skill: ParticipantSkillEntry;
  sessionId: string;
  isPending: boolean;
  onRemove: (personId: string, skillDefinitionId: string) => void;
};

function SessionSkillCard({
  skill,
  sessionId,
  isPending,
  onRemove,
}: SessionSkillCardProps) {
  const [levelPopoverOpen, setLevelPopoverOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleLevelChange = useCallback(
    (newLevel: SkillLevel | null) => {
      startTransition(async () => {
        const result = await updateSessionSkillLevelAction(
          sessionId,
          skill.personId,
          skill.skillDefinitionId,
          newLevel,
        );
        if (!result.success) {
          toast.error(result.error ?? "Failed to update level");
        }
      });
    },
    [sessionId, skill.personId, skill.skillDefinitionId],
  );

  function handleDragOver(e: React.DragEvent) {
    if (
      !skill.demonstratedEventId ||
      !e.dataTransfer.types.includes("application/x-media-id")
    ) {
      return;
    }
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
    if (!mediaId || !skill.demonstratedEventId) return;

    // Check if already linked
    if (skill.eventMedia.some((m) => m.id === mediaId)) {
      toast.info("Media already linked to this skill");
      return;
    }

    startTransition(async () => {
      const result = await addMediaToSessionSkillAction(
        sessionId,
        skill.personId,
        skill.skillDefinitionId,
        [mediaId],
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to link media");
      }
    });
  }

  function handleRemoveMedia(mediaItemId: string) {
    startTransition(async () => {
      const result = await removeMediaFromSessionSkillAction(
        sessionId,
        skill.personId,
        skill.skillDefinitionId,
        mediaItemId,
      );
      if (!result.success) {
        toast.error(result.error ?? "Failed to unlink media");
      }
    });
  }

  const maxThumbs = 4;
  const visibleMedia = skill.eventMedia.slice(0, maxThumbs);
  const overflowCount = skill.eventMedia.length - maxThumbs;

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
        {skill.skillDefinition.pgrade != null && (
          <span className="text-[10px] rounded bg-primary/15 px-1 py-0 font-medium text-primary">
            PG:{skill.skillDefinition.pgrade}
          </span>
        )}

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
          onClick={() => onRemove(skill.personId, skill.skillDefinitionId)}
          disabled={isPending}
          className="rounded-full p-1 text-muted-foreground/50 transition-all hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Remove ${skill.skillDefinition.name}`}
        >
          <X size={12} />
        </button>
      </div>

      {/* Media row */}
      {skill.demonstratedEventId && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {visibleMedia.map((m) => (
            <div key={m.id} className="group/thumb relative">
              <img
                src={m.thumbUrl}
                alt=""
                className="h-8 w-8 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveMedia(m.id)}
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/thumb:opacity-100"
                aria-label="Unlink media"
              >
                <X size={8} />
              </button>
            </div>
          ))}
          {overflowCount > 0 && (
            <span className="text-xs text-muted-foreground">
              +{overflowCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMediaPickerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-white/20 text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground"
            aria-label="Add media"
          >
            <ImagePlus size={14} />
          </button>
        </div>
      )}

      {/* Drop hint */}
      {dragOver && skill.demonstratedEventId && (
        <p className="mt-1.5 text-center text-xs text-primary/70">
          Drop to link media
        </p>
      )}

      {/* Media picker sheet */}
      {mediaPickerOpen && skill.demonstratedEventId && (
        <SkillEventMediaPicker
          eventId={skill.demonstratedEventId}
          sessionId={sessionId}
          personId={skill.personId}
          existingMediaIds={skill.eventMedia.map((m) => m.id)}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SessionParticipantSkills({
  sessionId,
  entries,
  skillGroups,
  participants,
}: SessionParticipantSkillsProps) {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(
    () => new Set(groupByPerson(entries).map((g) => g.personId)),
  );

  const grouped = groupByPerson(entries);

  const assignedKeys = new Set(
    entries.map((e) => `${e.personId}:${e.skillDefinitionId}`),
  );

  function togglePerson(personId: string) {
    setExpandedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function handleRemove(personId: string, skillDefinitionId: string) {
    startTransition(async () => {
      await removeSessionParticipantSkillAction(
        sessionId,
        personId,
        skillDefinitionId,
      );
    });
  }

  return (
    <div>
      {/* Grouped skill list */}
      {grouped.length === 0 && !isAddSheetOpen ? (
        <p className="text-sm italic text-muted-foreground/70">
          No participant skills recorded for this session.
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
                  {group.skills.length}{" "}
                  {group.skills.length === 1 ? "skill" : "skills"}
                </span>
              </button>

              {expandedPersons.has(group.personId) && (
                <div className="ml-6 mt-1 space-y-2">
                  {group.skills.map((skill) => (
                    <SessionSkillCard
                      key={skill.skillDefinitionId}
                      skill={skill}
                      sessionId={sessionId}
                      isPending={isPending}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add skill button */}
      <button
        type="button"
        onClick={() => setIsAddSheetOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Plus size={14} />
        Add skill
      </button>

      {/* Add skill sheet */}
      {isAddSheetOpen && (
        <AddSessionSkillSheet
          sessionId={sessionId}
          participants={participants}
          skillGroups={skillGroups}
          assignedKeys={assignedKeys}
          onClose={() => setIsAddSheetOpen(false)}
        />
      )}
    </div>
  );
}
