import type { SkillLevel, SkillEventType } from "@/generated/prisma/client";

export const SKILL_LEVEL_VALUE: Record<SkillLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  PROFESSIONAL: 4,
  EXPERT: 5,
};

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  PROFESSIONAL: "Professional",
  EXPERT: "Expert",
};

export const SKILL_LEVEL_STYLES: Record<SkillLevel, string> = {
  BEGINNER: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  INTERMEDIATE:
    "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  ADVANCED:
    "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  PROFESSIONAL:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  EXPERT:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

export const SKILL_EVENT_STYLES: Record<
  SkillEventType,
  { color: string; label: string }
> = {
  ACQUIRED: { color: "text-green-400", label: "Acquired" },
  IMPROVED: { color: "text-blue-400", label: "Improved" },
  DEMONSTRATED: { color: "text-amber-400", label: "Demonstrated" },
  RETIRED: { color: "text-red-400", label: "Retired" },
};

export const SKILL_LEVELS: SkillLevel[] = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PROFESSIONAL",
  "EXPERT",
];

export const SKILL_EVENT_TYPES: SkillEventType[] = [
  "ACQUIRED",
  "IMPROVED",
  "DEMONSTRATED",
  "RETIRED",
];

export const SKILL_LEVEL_DELTA: Record<SkillLevel, number> = {
  BEGINNER: -0.4,
  INTERMEDIATE: -0.2,
  ADVANCED: 0,
  PROFESSIONAL: 0.2,
  EXPERT: 0.4,
};

export const SKILL_LEVEL_NULL_DELTA = 0;
