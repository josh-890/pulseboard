"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
} from "@/lib/constants/skill";
import { addContributionSkillAction } from "@/lib/actions/contribution-actions";

type SkillDefOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pgrade: number | null;
  defaultLevel: SkillLevel | null;
};

type SkillGroupOption = {
  id: string;
  name: string;
  definitions: SkillDefOption[];
};

type AddContributionSkillSheetProps = {
  sessionId: string;
  contributions: { contributionId: string; displayName: string }[];
  skillGroups: SkillGroupOption[];
  assignedKeys: Set<string>;
  onClose: () => void;
};

export function AddContributionSkillSheet({
  sessionId,
  contributions,
  skillGroups,
  assignedKeys,
  onClose,
}: AddContributionSkillSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedContributionId, setSelectedContributionId] = useState<string>(
    contributions.length === 1 ? contributions[0].contributionId : "",
  );
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [notes, setNotes] = useState("");

  // Auto-set default level when skill changes
  function handleSkillChange(skillDefId: string) {
    setSelectedSkillId(skillDefId);
    if (skillDefId) {
      for (const group of skillGroups) {
        const def = group.definitions.find((d) => d.id === skillDefId);
        if (def?.defaultLevel) {
          setLevel(def.defaultLevel);
          return;
        }
      }
    }
    setLevel("");
  }

  // Filter out skills already assigned to the selected contribution
  const availableGroups = skillGroups
    .map((g) => ({
      ...g,
      definitions: g.definitions.filter(
        (d) => !assignedKeys.has(`${selectedContributionId}:${d.id}`),
      ),
    }))
    .filter((g) => g.definitions.length > 0);

  function handleSubmit() {
    if (!selectedContributionId || !selectedSkillId) return;
    startTransition(async () => {
      const result = await addContributionSkillAction(
        selectedContributionId,
        selectedSkillId,
        sessionId,
        (level as SkillLevel) || null,
        notes || null,
      );
      if (result.success) {
        onClose();
      }
    });
  }

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
          <h2 className="text-lg font-semibold">Add Contribution Skill</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Contribution selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Contributor
            </label>
            {contributions.length === 1 ? (
              <p className="text-sm text-muted-foreground">
                {contributions[0].displayName}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {contributions.map((c) => (
                  <button
                    key={c.contributionId}
                    type="button"
                    onClick={() => {
                      setSelectedContributionId(c.contributionId);
                      setSelectedSkillId("");
                      setLevel("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                      selectedContributionId === c.contributionId
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-white/15 text-muted-foreground hover:border-white/30 hover:text-foreground",
                    )}
                  >
                    {c.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Skill selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Skill</label>
            <select
              value={selectedSkillId}
              onChange={(e) => handleSkillChange(e.target.value)}
              disabled={!selectedContributionId}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">Select a skill...</option>
              {availableGroups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.definitions.map((d) => (
                    <option
                      key={d.id}
                      value={d.id}
                      title={d.description ?? undefined}
                    >
                      {d.name}
                      {d.pgrade != null ? ` [PG ${d.pgrade}]` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Level pills */}
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

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Demonstrated during scene 3..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !selectedContributionId || !selectedSkillId}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Plus size={14} />
            Add Skill
          </button>
        </div>
      </div>
    </div>
  );
}
