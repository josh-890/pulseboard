import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

type StatusFilterProps = {
  value: ProjectStatus | "all";
  onChange: (status: ProjectStatus | "all") => void;
};

const statuses: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <Button
          key={status.value}
          variant={value === status.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(status.value)}
          className={cn(
            value !== status.value &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {status.label}
        </Button>
      ))}
    </div>
  );
}
