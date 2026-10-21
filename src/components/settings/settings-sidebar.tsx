"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Paintbrush, LayoutGrid, HardDrive, TriangleAlert, Radar, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsNav } from "./settings-nav-provider";

const NAV_ITEMS = [
  { href: "/settings/appearance", label: "Appearance", icon: Paintbrush },
  { href: "/settings/catalogs", label: "Catalogs", icon: LayoutGrid },
  { href: "/settings/scanning", label: "Scanning", icon: Radar },
  { href: "/settings/storage", label: "Storage", icon: HardDrive },
  { href: "/settings/system", label: "System", icon: TriangleAlert, danger: true },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSettingsNav();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Show settings navigation" : "Hide settings navigation";

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-white/10 pr-2 transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-12" : "w-48",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        className="mb-1 flex h-8 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ToggleIcon size={16} aria-hidden="true" />
      </button>
      <nav className="flex flex-col gap-0.5" aria-label="Settings">
        {NAV_ITEMS.map(({ href, label, icon: Icon, danger }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "px-3",
                isActive
                  ? danger
                    ? "bg-destructive/10 text-destructive"
                    : "bg-white/10 text-foreground"
                  : danger
                    ? "text-amber-500/80 hover:bg-destructive/5 hover:text-destructive"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
