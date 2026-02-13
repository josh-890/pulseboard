import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type PersonSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PersonSearch({ value, onChange }: PersonSearchProps) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        placeholder="Search people..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
