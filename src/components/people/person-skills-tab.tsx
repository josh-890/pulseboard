"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import type { PersonSkillItem, PersonSkillEventItem } from "@/lib/types";
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import {
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
  SKILL_EVENT_STYLES,
} from "@/lib/constants/skill";
import { deletePersonSkillAction, deleteSkillEventAction } from "@/lib/actions/skill-actions";
import { AddSkillSheet } from "./add-skill-sheet";
import { AddSkillEventDialog } from "./add-skill-event-dialog";

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

export function PersonSkillsTab({
  personId,
  skills,
  skillGroups,
  personas,
}: PersonSkillsTabProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groupSkills(skills).map((g) => g.groupName)),
  );
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingSkill, setEditingSkill] = useState<PersonSkillItem | null>(
    null,
  );
  const [addingEventForSkill, setAddingEventForSkill] =
    useState<PersonSkillItem | null>(null);

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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
  // Sort by persona date (nulls last)
  allEvents.sort((a, b) => {
    if (!a.personaDate && !b.personaDate) return 0;
    if (!a.personaDate) return 1;
    if (!b.personaDate) return -1;
    return a.personaDate.getTime() - b.personaDate.getTime();
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
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
          >
            <Plus size={12} />
            Add Skill
          </button>
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
                      <span>{event.personaLabel}</span>
                      {event.personaDate && (
                        <span>
                          {formatPartialDate(event.personaDate, "DAY")}
                        </span>
                      )}
                    </div>
                    {event.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70 italic">
                        {event.notes}
                      </p>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() =>
                      deleteSkillEventAction(event.id, personId)
                    }
                    className="invisible shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
                    aria-label="Delete event"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add skill sheet */}
      {showAddSheet && (
        <AddSkillSheet
          personId={personId}
          skillGroups={skillGroups}
          personas={personas}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {/* Edit skill sheet */}
      {editingSkill && (
        <AddSkillSheet
          personId={personId}
          skillGroups={skillGroups}
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
    </div>
  );
}

// ── Skill Card (inline sub-component) ────────────────────────────────────────

function SkillCard({
  skill,
  personId,
  onEdit,
  onAddEvent,
}: {
  skill: PersonSkillItem;
  personId: string;
  onEdit: () => void;
  onAddEvent: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/20">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{skill.name}</span>
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
        </div>
        {skill.evidence && (
          <p className="mt-0.5 text-xs text-muted-foreground/60 italic">
            {skill.evidence}
          </p>
        )}
        {skill.events.length > 0 && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/50">
            {skill.events.length} event{skill.events.length !== 1 && "s"}
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
  );
}
