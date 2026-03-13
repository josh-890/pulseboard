"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import type { PersonSkillItem, PersonSkillEventItem, GalleryItem } from "@/lib/types";
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import {
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
  SKILL_EVENT_STYLES,
} from "@/lib/constants/skill";
import { createPersonSkillAction, deletePersonSkillAction, deleteSkillEventAction } from "@/lib/actions/skill-actions";
import { EditSkillSheet } from "./edit-skill-sheet";
import { AddSkillEventDialog } from "./add-skill-event-dialog";
import { SkillEventMediaPicker } from "./skill-event-media-picker";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { SkillCombobox } from "@/components/skills/skill-combobox";
import type { SkillDefOption } from "@/components/skills/skill-combobox";

type PersonaOption = { id: string; label: string };

type PersonSkillsTabProps = {
  personId: string;
  skills: PersonSkillItem[];
  skillGroups: SkillGroupWithDefinitions[];
  personas: PersonaOption[];
};

type SkillsByGroup = {
  groupName: string;
  skills: PersonSkillItem[];
};

type PickerState = {
  eventId: string;
  sessionId: string;
  existingMediaIds: string[];
};

type LightboxState = {
  items: GalleryItem[];
  initialIndex: number;
};

/** Parse `[session:ID] Demonstrated in session: Name` from event notes */
function parseSessionRef(notes: string | null): { sessionId: string; sessionName: string; rest: string } | null {
  if (!notes) return null;
  const match = notes.match(/^\[session:([^\]]+)\]\s*Demonstrated in session:\s*(.+)$/);
  if (!match) return null;
  return { sessionId: match[1], sessionName: match[2], rest: "" };
}

function groupSkills(skills: PersonSkillItem[]): SkillsByGroup[] {
  const map = new Map<string, PersonSkillItem[]>();
  for (const skill of skills) {
    const group = skill.groupName ?? skill.category ?? "Other";
    const list = map.get(group) ?? [];
    list.push(skill);
    map.set(group, list);
  }
  return Array.from(map.entries()).map(([groupName, items]) => ({
    groupName,
    skills: items,
  }));
}

const MAX_THUMBS = 4;

export function PersonSkillsTab({
  personId,
  skills,
  skillGroups,
  personas,
}: PersonSkillsTabProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groupSkills(skills).map((g) => g.groupName)),
  );
  const [isAddPending, startAddTransition] = useTransition();
  const [editingSkill, setEditingSkill] = useState<PersonSkillItem | null>(
    null,
  );
  const [addingEventForSkill, setAddingEventForSkill] =
    useState<PersonSkillItem | null>(null);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const [lightboxState, setLightboxState] = useState<LightboxState | null>(null);

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const openLightbox = useCallback(async (eventId: string, initialIndex: number) => {
    try {
      const res = await fetch(`/api/skill-events/${eventId}/media`);
      const data = (await res.json()) as { items: GalleryItem[] };
      if (data.items.length > 0) {
        setLightboxState({ items: data.items, initialIndex });
      }
    } catch {
      // silently fail
    }
  }, []);

  const openSkillMedia = useCallback(async (skill: PersonSkillItem, thumbIndex: number) => {
    // Fetch full gallery items for all events of this skill that have media
    const eventsWithMedia = skill.events.filter((e) => e.media.length > 0);
    if (eventsWithMedia.length === 0) return;
    try {
      const results = await Promise.all(
        eventsWithMedia.map((e) =>
          fetch(`/api/skill-events/${e.id}/media`)
            .then((r) => r.json())
            .then((d: { items: GalleryItem[] }) => d.items),
        ),
      );
      const allItems = results.flat();
      if (allItems.length > 0) {
        setLightboxState({ items: allItems, initialIndex: Math.min(thumbIndex, allItems.length - 1) });
      }
    } catch {
      // silently fail
    }
  }, []);

  const grouped = groupSkills(skills);

  // Collect all events across skills for the timeline
  const allEvents: (PersonSkillEventItem & {
    skillName: string;
    skillId: string;
  })[] = [];
  for (const skill of skills) {
    for (const event of skill.events) {
      allEvents.push({
        ...event,
        skillName: skill.name,
        skillId: skill.id,
      });
    }
  }
  // Sort by event date (primary), persona date (fallback), nulls last
  const eventDate = (e: PersonSkillEventItem) => e.date ?? e.personaDate;
  allEvents.sort((a, b) => {
    const aDate = eventDate(a);
    const bDate = eventDate(b);
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.getTime() - bDate.getTime();
  });

  return (
    <div className="space-y-6">
      {/* Skills by Category */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <h3 className="text-base font-semibold">Skills</h3>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {skills.length}
            </span>
          </div>
          <SkillCombobox
            skillGroups={skillGroups}
            assignedSkillIds={new Set(
              skills
                .filter((s) => s.skillDefinitionId)
                .map((s) => s.skillDefinitionId!),
            )}
            onSelect={(def: SkillDefOption) => {
              startAddTransition(async () => {
                await createPersonSkillAction(personId, {
                  skillDefinitionId: def.id,
                  level: def.defaultLevel ?? null,
                });
              });
            }}
            isPending={isAddPending}
            triggerClassName="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
          />
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">
            No skills recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => {
              const isExpanded = expandedGroups.has(group.groupName);
              return (
                <div
                  key={group.groupName}
                  className="rounded-xl border border-white/10 bg-muted/15"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupName)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                    <span className="flex-1 text-sm font-medium">
                      {group.groupName}
                    </span>
                    <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {group.skills.length}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 py-2 space-y-2">
                      {group.skills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          personId={personId}
                          onEdit={() => setEditingSkill(skill)}
                          onAddEvent={() => setAddingEventForSkill(skill)}
                          onOpenSkillMedia={openSkillMedia}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Skill Timeline */}
      {allEvents.length > 0 && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-primary" />
            <h3 className="text-base font-semibold">Skill Timeline</h3>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {allEvents.length}
            </span>
          </div>

          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

            {allEvents.map((event) => {
              const style = SKILL_EVENT_STYLES[event.eventType];
              const sessionRef = parseSessionRef(event.notes);
              return (
                <div
                  key={event.id}
                  className="group relative flex items-start gap-3 py-2"
                >
                  {/* Dot */}
                  <div
                    className={cn(
                      "relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 bg-background",
                      event.eventType === "ACQUIRED" && "border-green-400",
                      event.eventType === "IMPROVED" && "border-blue-400",
                      event.eventType === "DEMONSTRATED" && "border-amber-400",
                      event.eventType === "RETIRED" && "border-red-400",
                    )}
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn("font-medium", style.color)}>
                        {style.label}
                      </span>
                      <span className="text-foreground font-medium">
                        {event.skillName}
                      </span>
                      {event.level && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
                            SKILL_LEVEL_STYLES[event.level],
                          )}
                        >
                          {SKILL_LEVEL_LABEL[event.level]}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {/* Show persona label only for non-session events */}
                      {event.personaLabel && !sessionRef && (
                        <span>{event.personaLabel}</span>
                      )}
                      {/* Session link for DEMONSTRATED events */}
                      {sessionRef && (
                        <Link
                          href={`/sessions/${sessionRef.sessionId}`}
                          className="text-primary/80 hover:text-primary transition-colors hover:underline"
                        >
                          {sessionRef.sessionName}
                        </Link>
                      )}
                      {event.date ? (
                        <span className="text-muted-foreground/60">
                          {formatPartialDate(event.date, event.datePrecision)}
                        </span>
                      ) : event.personaDate ? (
                        <span className="text-muted-foreground/60">
                          {formatPartialDate(event.personaDate, "DAY")}
                        </span>
                      ) : null}
                    </div>

                    {/* Inline media thumbnails */}
                    {event.media.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        {event.media.slice(0, MAX_THUMBS).map((m, i) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => openLightbox(event.id, i)}
                            className="h-9 w-9 shrink-0 overflow-hidden rounded border border-white/15 transition-all hover:border-white/40 hover:ring-1 hover:ring-primary/30"
                          >
                            <img
                              src={m.thumbUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                        {event.media.length > MAX_THUMBS && (
                          <button
                            type="button"
                            onClick={() => openLightbox(event.id, MAX_THUMBS)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 bg-muted/30 text-[10px] font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                          >
                            +{event.media.length - MAX_THUMBS}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Show notes only for non-session events (session info is already shown as link) */}
                    {event.notes && !sessionRef && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70 italic">
                        {event.notes}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="invisible flex shrink-0 items-center gap-0.5 group-hover:visible">
                    {/* Add media button — only for DEMONSTRATED events with a session */}
                    {sessionRef && (
                      <button
                        type="button"
                        onClick={() =>
                          setPickerState({
                            eventId: event.id,
                            sessionId: sessionRef.sessionId,
                            existingMediaIds: event.media.map((m) => m.id),
                          })
                        }
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Link media"
                        title="Link session media"
                      >
                        <ImageIcon size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        deleteSkillEventAction(event.id, personId)
                      }
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Delete event"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit skill sheet */}
      {editingSkill && (
        <EditSkillSheet
          personId={personId}
          personas={personas}
          editingSkill={editingSkill}
          onClose={() => setEditingSkill(null)}
        />
      )}

      {/* Add event dialog */}
      {addingEventForSkill && (
        <AddSkillEventDialog
          personId={personId}
          personSkillId={addingEventForSkill.id}
          skillName={addingEventForSkill.name}
          personas={personas}
          onClose={() => setAddingEventForSkill(null)}
        />
      )}

      {/* Skill event media picker */}
      {pickerState && (
        <SkillEventMediaPicker
          eventId={pickerState.eventId}
          sessionId={pickerState.sessionId}
          personId={personId}
          existingMediaIds={pickerState.existingMediaIds}
          onClose={() => setPickerState(null)}
        />
      )}

      {/* Lightbox for skill event media */}
      {lightboxState && (
        <GalleryLightbox
          items={lightboxState.items}
          initialIndex={lightboxState.initialIndex}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
}

// ── Skill Card (inline sub-component) ────────────────────────────────────────

const SKILL_CARD_MAX_THUMBS = 6;

function SkillCard({
  skill,
  personId,
  onEdit,
  onAddEvent,
  onOpenSkillMedia,
}: {
  skill: PersonSkillItem;
  personId: string;
  onEdit: () => void;
  onAddEvent: () => void;
  onOpenSkillMedia: (skill: PersonSkillItem, thumbIndex: number) => void;
}) {
  // Aggregate all media across all events for this skill
  const allMedia = skill.events.flatMap((e) => e.media);

  return (
    <div className="group rounded-lg px-3 py-2 transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              title={skill.definitionDescription ?? undefined}
            >
              {skill.name}
            </span>
            {skill.level && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium",
                  SKILL_LEVEL_STYLES[skill.level],
                )}
              >
                {SKILL_LEVEL_LABEL[skill.level]}
              </span>
            )}
            {skill.definitionPgrade != null && (
              <span className={cn(
                "text-[10px] rounded px-1.5 py-0.5 font-medium",
                skill.definitionPgrade > 0
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/50 text-muted-foreground/50",
              )}>
                PG {skill.definitionPgrade}
              </span>
            )}
          </div>
          {skill.evidence && (
            <p className="mt-0.5 text-xs text-muted-foreground/60 italic">
              {skill.evidence}
            </p>
          )}
          {skill.events.length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50">
              {skill.events.length} event{skill.events.length !== 1 && "s"}
              {allMedia.length > 0 && <> · {allMedia.length} photo{allMedia.length !== 1 && "s"}</>}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="invisible flex shrink-0 items-center gap-1 group-hover:visible">
          <button
            type="button"
            onClick={onAddEvent}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add event"
            title="Add event"
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Edit skill"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => deletePersonSkillAction(skill.id, personId)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Delete skill"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Aggregated media thumbnails */}
      {allMedia.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          {allMedia.slice(0, SKILL_CARD_MAX_THUMBS).map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpenSkillMedia(skill, i)}
              className="h-9 w-9 shrink-0 overflow-hidden rounded border border-white/15 transition-all hover:border-white/40 hover:ring-1 hover:ring-primary/30"
            >
              <img
                src={m.thumbUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
          {allMedia.length > SKILL_CARD_MAX_THUMBS && (
            <button
              type="button"
              onClick={() => onOpenSkillMedia(skill, SKILL_CARD_MAX_THUMBS)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 bg-muted/30 text-[10px] font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
            >
              +{allMedia.length - SKILL_CARD_MAX_THUMBS}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
