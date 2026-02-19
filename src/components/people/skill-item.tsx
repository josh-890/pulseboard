import { cn } from "@/lib/utils";
import type { PersonSkillItem } from "@/lib/types";

type SkillItemProps = {
  skill: PersonSkillItem;
};

const LEVEL_STYLES: Record<string, string> = {
  beginner: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  intermediate: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  advanced: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  professional: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  expert: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

export function SkillItem({ skill }: SkillItemProps) {
  const levelStyle = skill.level ? (LEVEL_STYLES[skill.level.toLowerCase()] ?? "bg-muted/50 text-muted-foreground border-white/15") : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{skill.name}</p>
        {skill.category && (
          <p className="text-xs text-muted-foreground/70 capitalize">{skill.category}</p>
        )}
        {skill.evidence && (
          <p className="mt-0.5 text-xs text-muted-foreground/60 italic">{skill.evidence}</p>
        )}
      </div>

      {skill.level && levelStyle && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
            levelStyle,
          )}
        >
          {skill.level}
        </span>
      )}
    </div>
  );
}
