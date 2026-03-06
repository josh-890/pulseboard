"use client";

import { useCallback, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
} from "@/lib/constants/skill";
import {
  createPersonSkillAction,
  updatePersonSkillAction,
} from "@/lib/actions/skill-actions";
import type { PersonSkillItem } from "@/lib/types";

type PersonaOption = { id: string; label: string };

type AddSkillSheetProps = {
  personId: string;
  skillGroups: SkillGroupWithDefinitions[];
  personas: PersonaOption[];
  editingSkill?: PersonSkillItem | null;
  onClose: () => void;
};

export function AddSkillSheet({
  personId,
  skillGroups,
  personas,
  editingSkill,
  onClose,
}: AddSkillSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedDefId, setSelectedDefId] = useState<string>(
    editingSkill?.skillDefinitionId ?? "",
  );
  const [level, setLevel] = useState<SkillLevel | "">(
    editingSkill?.level ?? "",
  );
  const [evidence, setEvidence] = useState(editingSkill?.evidence ?? "");
  const [personaId, setPersonaId] = useState(
    // Find the persona ID from the label if editing
    editingSkill?.personaLabel
      ? personas.find((p) => p.label === editingSkill.personaLabel)?.id ?? ""
      : "",
  );

  const handleSubmit = useCallback(() => {
    if (!editingSkill && !selectedDefId) return;

    startTransition(async () => {
      if (editingSkill) {
        await updatePersonSkillAction(editingSkill.id, personId, {
          level: (level as SkillLevel) || null,
          evidence: evidence || null,
          personaId: personaId || null,
        });
      } else {
        await createPersonSkillAction(personId, {
          skillDefinitionId: selectedDefId || null,
          level: (level as SkillLevel) || null,
          evidence: evidence || null,
          personaId: personaId || null,
        });
      }
      onClose();
    });
  }, [
    editingSkill,
    selectedDefId,
    level,
    evidence,
    personaId,
    personId,
    onClose,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">
            {editingSkill ? "Edit Skill" : "Add Skill"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Skill definition selector */}
          {!editingSkill && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Skill
              </label>
              <select
                value={selectedDefId}
                onChange={(e) => setSelectedDefId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a skill...</option>
                {skillGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.definitions.map((def) => (
                      <option key={def.id} value={def.id}>
                        {def.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {editingSkill && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">Skill</label>
              <p className="text-sm text-muted-foreground">{editingSkill.name}</p>
            </div>
          )}

          {/* Level selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Level</label>
            <div className="flex flex-wrap gap-2">
              {SKILL_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(level === l ? "" : l)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                    level === l
                      ? SKILL_LEVEL_STYLES[l]
                      : "border-white/15 text-muted-foreground hover:border-white/30",
                  )}
                >
                  {SKILL_LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          {/* Persona */}
          {personas.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Persona (optional)
              </label>
              <select
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Evidence */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Evidence (optional)
            </label>
            <input
              type="text"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="e.g. Portfolio link, certification..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || (!editingSkill && !selectedDefId)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Plus size={14} />
            {editingSkill ? "Save Changes" : "Add Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}
