"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Paintbrush, LayoutGrid, HardDrive, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/settings/appearance", label: "Appearance", icon: Paintbrush },
  { href: "/settings/catalogs", label: "Catalogs", icon: LayoutGrid },
  { href: "/settings/storage", label: "Storage", icon: HardDrive },
  { href: "/settings/system", label: "System", icon: TriangleAlert, danger: true },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 border-r border-white/10 pr-2">
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, danger }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? danger
                    ? "bg-destructive/10 text-destructive"
                    : "bg-white/10 text-foreground"
                  : danger
                    ? "text-amber-500/80 hover:bg-destructive/5 hover:text-destructive"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
