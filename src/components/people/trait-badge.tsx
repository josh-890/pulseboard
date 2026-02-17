import {
  Code,
  Award,
  Sparkles,
  Dumbbell,
  Languages,
  Heart,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ComputedTrait } from "@/lib/types";

type TraitBadgeProps = {
  trait: ComputedTrait;
};

const categoryStyles: Record<string, string> = {
  Skill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Certificate:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "Body Modification":
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  Physical:
    "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  Language:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Interest:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
};

const defaultStyle =
  "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";

const categoryIcons: Record<string, typeof Code> = {
  Skill: Code,
  Certificate: Award,
  "Body Modification": Sparkles,
  Physical: Dumbbell,
  Language: Languages,
  Interest: Heart,
};

function getMetadataHint(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const hint = metadata.level ?? metadata.proficiency ?? metadata.provider ?? metadata.type;
  return hint ? String(hint) : null;
}

export function TraitBadge({ trait }: TraitBadgeProps) {
  const Icon = categoryIcons[trait.categoryName] ?? Tag;
  const style = categoryStyles[trait.categoryName] ?? defaultStyle;
  const hint = getMetadataHint(trait.metadata);

  return (
    <Badge
      variant="secondary"
      className={cn("rounded-full border-0 gap-1", style)}
    >
      <Icon size={12} />
      {trait.name}
      {hint && (
        <span className="opacity-70">&middot; {hint}</span>
      )}
    </Badge>
  );
}
