import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectRole } from "@/lib/types";

type RoleFilterProps = {
  value: ProjectRole | "all";
  onChange: (role: ProjectRole | "all") => void;
};

const roles: { value: ProjectRole | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stakeholder", label: "Stakeholder" },
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
];

export function RoleFilter({ value, onChange }: RoleFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => (
        <Button
          key={role.value}
          variant={value === role.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(role.value)}
          className={cn(
            value !== role.value &&
              "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          )}
        >
          {role.label}
        </Button>
      ))}
    </div>
  );
}
