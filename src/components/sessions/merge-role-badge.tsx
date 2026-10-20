import { cn } from "@/lib/utils";

export type MergeRoleBadgeProps = {
  role: "stays" | "goes";
};

/** "Stays" (the older session) or "Merged in" (the one deleted after the merge) */
export function MergeRoleBadge({ role }: MergeRoleBadgeProps) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        role === "stays"
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      )}
    >
      {role === "stays" ? "Stays" : "Merged in"}
    </span>
  );
}
