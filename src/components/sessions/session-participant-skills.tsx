"use client";

import { useState, useTransition } from "react";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  addSessionParticipantSkillAction,
  removeSessionParticipantSkillAction,
} from "@/lib/actions/skill-actions";

// ─── Types ──────────────────────────────────────────────────────────────────

type ParticipantSkillEntry = {
  sessionId: string;
  personId: string;
  skillDefinitionId: string;
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
    group: { name: string };
  };
};

type SkillGroupOption = {
  id: string;
  name: string;
  definitions: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
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

function groupByPerson(
  entries: ParticipantSkillEntry[],
): GroupedByPerson[] {
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

// ─── Component ──────────────────────────────────────────────────────────────

export function SessionParticipantSkills({
  sessionId,
  entries,
  skillGroups,
  participants,
}: SessionParticipantSkillsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(
    () => new Set(groupByPerson(entries).map((g) => g.personId)),
  );

  const grouped = groupByPerson(entries);

  // Build set of already-assigned (personId, skillDefinitionId) for filtering
  const assignedSet = new Set(
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

  function handleAdd() {
    if (!selectedPersonId || !selectedSkillId) return;
    startTransition(async () => {
      const result = await addSessionParticipantSkillAction(
        sessionId,
        selectedPersonId,
        selectedSkillId,
      );
      if (result.success) {
        setSelectedPersonId("");
        setSelectedSkillId("");
        setIsAdding(false);
      }
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

  // Filter out skills already assigned to the selected person
  const availableGroups = skillGroups
    .map((g) => ({
      ...g,
      definitions: g.definitions.filter(
        (d) => !assignedSet.has(`${selectedPersonId}:${d.id}`),
      ),
    }))
    .filter((g) => g.definitions.length > 0);

  return (
    <div>
      {/* Grouped skill list */}
      {grouped.length === 0 && !isAdding ? (
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
                  {group.skills.length} {group.skills.length === 1 ? "skill" : "skills"}
                </span>
              </button>

              {expandedPersons.has(group.personId) && (
                <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                  {group.skills.map((skill) => (
                    <span
                      key={skill.skillDefinitionId}
                      className="group/tag inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-muted/50 px-2.5 py-1 text-xs font-medium"
                    >
                      <span className="text-muted-foreground/70">
                        {skill.skillDefinition.group.name}
                      </span>
                      <span className="text-foreground/90">
                        {skill.skillDefinition.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleRemove(skill.personId, skill.skillDefinitionId)
                        }
                        disabled={isPending}
                        className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/20 hover:text-destructive group-hover/tag:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label={`Remove ${skill.skillDefinition.name} from ${group.displayName}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {isAdding ? (
        <div className="mt-3 rounded-xl border border-white/15 bg-card/40 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {/* Person select */}
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                Participant
              </label>
              <select
                value={selectedPersonId}
                onChange={(e) => {
                  setSelectedPersonId(e.target.value);
                  setSelectedSkillId("");
                }}
                className="w-full rounded-lg border border-white/15 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select participant…</option>
                {participants.map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Skill select */}
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                Skill
              </label>
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                disabled={!selectedPersonId}
                className="w-full rounded-lg border border-white/15 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Select skill…</option>
                {availableGroups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {g.definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedPersonId || !selectedSkillId || isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Plus size={14} />
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setSelectedPersonId("");
                  setSelectedSkillId("");
                }}
                className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plus size={14} />
          Add skill
        </button>
      )}
    </div>
  );
}
