import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type ProjectSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ProjectSearch({ value, onChange }: ProjectSearchProps) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        placeholder="Search projects..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
