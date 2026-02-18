"use client";

import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ImageIcon,
  Building2,
  Network,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { NavLink } from "./nav-link";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { href: "/people", icon: <Users size={20} />, label: "People" },
  { href: "/sets", icon: <ImageIcon size={20} />, label: "Sets" },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/labels", icon: <Building2 size={20} />, label: "Labels" },
  { href: "/networks", icon: <Network size={20} />, label: "Networks" },
  { href: "/settings", icon: <Settings size={20} />, label: "Settings" },
];

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <aside
      className={cn(
        "relative hidden flex-col overflow-visible border-r border-white/20 bg-card/50 backdrop-blur-sm transition-all duration-200 md:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-card text-muted-foreground transition-colors duration-200 hover:bg-muted/80 hover:text-foreground"
      >
        {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
      </button>

      <div className={cn("p-6", collapsed && "flex justify-center px-2")}>
        {collapsed ? (
          <span className="text-xl font-bold text-foreground">P</span>
        ) : (
          <h1 className="text-xl font-bold text-foreground">Pulseboard</h1>
        )}
      </div>

      <nav className={cn("flex flex-1 flex-col gap-1", collapsed ? "px-2" : "px-3")}>
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
