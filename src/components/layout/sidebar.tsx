"use client";

import { LayoutDashboard, FolderKanban, Settings } from "lucide-react";
import { NavLink } from "./nav-link";

const navItems = [
  { href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/settings", icon: <Settings size={20} />, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 flex-col border-r border-white/20 bg-card/50 backdrop-blur-sm md:flex">
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground">Pulseboard</h1>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
    </aside>
  );
}
