import Link from "next/link";
import { cn } from "@/lib/utils";

type MaintenanceTabsProps = {
  current: "by-attribute" | "by-person";
};

export function MaintenanceTabs({ current }: MaintenanceTabsProps) {
  const tabs: { id: "by-attribute" | "by-person"; label: string; href: string }[] = [
    { id: "by-attribute", label: "By attribute", href: "/maintenance" },
    { id: "by-person", label: "By person", href: "/maintenance?view=by-person" },
  ];

  return (
    <div className="flex gap-1 rounded-lg border border-white/10 bg-card/30 p-1 w-fit">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            current === t.id
              ? "bg-amber-500/20 text-amber-300"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
