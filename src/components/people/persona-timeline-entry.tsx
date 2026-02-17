import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PersonaTimelineEntry as TimelineEntryType } from "@/lib/types";

type PersonaTimelineEntryProps = {
  entry: TimelineEntryType;
  isFirst: boolean;
  actions?: ReactNode;
};

const fieldLabels: Record<string, string> = {
  jobTitle: "Job Title",
  department: "Department",
  phone: "Phone",
  address: "Address",
};

export function PersonaTimelineEntry({
  entry,
  isFirst,
  actions,
}: PersonaTimelineEntryProps) {
  const isBaseline = entry.sequenceNum === 0;
  const formattedDate = entry.effectiveDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "mt-1.5 h-3 w-3 shrink-0 rounded-full border-2",
            isBaseline
              ? "border-primary bg-primary"
              : "border-primary/60 bg-background",
          )}
        />
        {!isFirst && (
          <div className="w-px grow bg-border" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{formattedDate}</span>
          <Badge variant="outline" className="rounded-full text-xs">
            {isBaseline ? "Baseline" : `#${entry.sequenceNum}`}
          </Badge>
          {entry.note && (
            <span className="text-sm italic text-muted-foreground">
              {entry.note}
            </span>
          )}
          {actions && <div className="ml-auto">{actions}</div>}
        </div>

        {/* Scalar changes */}
        {entry.scalarChanges.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {entry.scalarChanges.map((change) => (
              <li key={change.field} className="text-sm">
                <span className="text-muted-foreground">
                  {fieldLabels[change.field] ?? change.field}
                </span>
                {" \u2192 "}
                <span className="font-medium">{change.value ?? "cleared"}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Trait changes */}
        {entry.traitChanges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.traitChanges.map((tc) => (
              <Badge
                key={`${tc.categoryName}:${tc.name}:${tc.action}`}
                variant="secondary"
                className={cn(
                  "rounded-full border-0 text-xs",
                  tc.action === "add"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                )}
              >
                {tc.action === "add" ? "+" : "\u2212"}
                {tc.name}
                <span className="ml-1 opacity-70">({tc.categoryName})</span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
