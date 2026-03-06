import { cn } from "@/lib/utils";
import type { PersonSkillItem } from "@/lib/types";
import {
  SKILL_LEVEL_STYLES,
  SKILL_LEVEL_LABEL,
} from "@/lib/constants/skill";

type SkillItemProps = {
  skill: PersonSkillItem;
  compact?: boolean;
};

export function SkillItem({ skill, compact }: SkillItemProps) {
  const levelStyle = skill.level
    ? SKILL_LEVEL_STYLES[skill.level]
    : null;
  const levelLabel = skill.level
    ? SKILL_LEVEL_LABEL[skill.level]
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-white/10 bg-card/40",
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{skill.name}</p>
        {!compact && skill.category && (
          <p className="text-xs text-muted-foreground/70 capitalize">
            {skill.category}
          </p>
        )}
        {!compact && skill.evidence && (
          <p className="mt-0.5 text-xs text-muted-foreground/60 italic">
            {skill.evidence}
          </p>
        )}
      </div>

      {levelLabel && levelStyle && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            levelStyle,
          )}
        >
          {levelLabel}
        </span>
      )}
    </div>
  );
}
