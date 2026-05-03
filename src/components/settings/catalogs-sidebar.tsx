"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CATALOG_ITEMS = [
  { href: "/settings/catalogs/media", label: "Media Categories" },
  { href: "/settings/catalogs/roles", label: "Contribution Roles" },
  { href: "/settings/catalogs/profile-slots", label: "Profile Slots" },
  { href: "/settings/catalogs/attributes", label: "Attributes" },
  { href: "/settings/catalogs/skills", label: "Skills" },
  { href: "/settings/catalogs/tags", label: "Tags" },
];

export function CatalogsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-40 shrink-0 border-r border-white/10 pr-2">
      <nav className="flex flex-col gap-0.5">
        {CATALOG_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-white/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
