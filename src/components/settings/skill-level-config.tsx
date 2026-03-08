"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateSkillLevelConfigAction } from "@/lib/actions/setting-actions";
import type { SkillLevelConfig } from "@/lib/services/setting-service";
import { SKILL_LEVEL_LABEL, SKILL_LEVEL_DELTA, SKILL_LEVELS } from "@/lib/constants/skill";
import { cn } from "@/lib/utils";

type SkillLevelConfigProps = {
  configs: SkillLevelConfig[];
};

const PREVIEW_PGRADE = 8;

export function SkillLevelConfig({ configs }: SkillLevelConfigProps) {
  const [rows, setRows] = useState(
    configs.map((c) => ({ level: c.level, enumKey: c.enumKey, label: c.label, delta: c.delta })),
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function updateRow(level: number, field: "label" | "delta", value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.level === level
          ? {
              ...r,
              [field]: field === "delta" ? (value === "" ? 0 : parseFloat(value)) : value,
            }
          : r,
      ),
    );
  }

  function resetToDefaults() {
    setRows(
      SKILL_LEVELS.map((enumKey, i) => ({
        level: i + 1,
        enumKey,
        label: SKILL_LEVEL_LABEL[enumKey],
        delta: SKILL_LEVEL_DELTA[enumKey],
      })),
    );
  }

  function handleSaveAll() {
    startTransition(async () => {
      const result = await updateSkillLevelConfigAction({
        levels: rows.map((r) => ({
          level: r.level,
          label: r.label.trim(),
          delta: r.delta,
        })),
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const hasChanges = rows.some((r, i) => {
    const orig = configs[i];
    return r.label.trim() !== orig.label || r.delta !== orig.delta;
  });

  return (
    <div className="space-y-4">
      {/* Table header */}
      <div className="hidden sm:grid sm:grid-cols-[3rem_1fr_5rem_1fr] items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
        <span>Level</span>
        <span>Label</span>
        <span>Delta</span>
        <span>WCP Preview (PG={PREVIEW_PGRADE})</span>
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const wcpValue = Math.min(PREVIEW_PGRADE + row.delta, 10);
        const pct = Math.max((wcpValue / 10) * 100, 0);

        return (
          <div
            key={row.level}
            className="grid grid-cols-[3rem_1fr_5rem_1fr] items-center gap-3"
          >
            {/* Level number */}
            <span className="text-sm font-medium text-muted-foreground text-center">
              {row.level}
            </span>

            {/* Label input */}
            <Input
              value={row.label}
              onChange={(e) => updateRow(row.level, "label", e.target.value)}
              className="max-w-[180px]"
              placeholder={SKILL_LEVEL_LABEL[row.enumKey]}
            />

            {/* Delta input */}
            <Input
              type="number"
              step={0.1}
              min={-5.0}
              max={5.0}
              value={row.delta}
              onChange={(e) => updateRow(row.level, "delta", e.target.value)}
              className="w-[5rem] text-center"
            />

            {/* WCP Preview bar */}
            <div className="flex items-center gap-2">
              <div className="relative h-3 flex-1 max-w-[160px] rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-200",
                    wcpValue >= 10 ? "bg-amber-500" : "bg-primary/70",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                {wcpValue.toFixed(1)}
                {wcpValue >= 10 && (
                  <span className="text-[10px] text-amber-500 ml-0.5">cap</span>
                )}
              </span>
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={handleSaveAll}
          disabled={!hasChanges || isPending}
          size="sm"
          className="min-w-[100px]"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-green-400" /> Saved
            </span>
          ) : (
            "Save All"
          )}
        </Button>
        <button
          type="button"
          onClick={resetToDefaults}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw size={12} /> Reset to Defaults
        </button>
      </div>
    </div>
  );
}
