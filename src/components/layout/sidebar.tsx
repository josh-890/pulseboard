"use client";

import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ImageIcon,
  Building2,
  Radio,
  Network,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Clapperboard,
  Library,
  Layers,
  LogOut,
  Upload,
  Palette,
  HardDrive,
} from "lucide-react";
import { NavLink } from "./nav-link";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/lib/utils";
import { getBrowseReturnUrl } from "@/lib/browse-context";
import { logoutAction } from "@/lib/actions/auth-actions";

const navItems = [
  { href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { href: "/sessions", icon: <Clapperboard size={20} />, label: "Sessions" },
  { href: "/sets", icon: <ImageIcon size={20} />, label: "Sets" },
  { href: "/collections", icon: <Library size={20} />, label: "Collections" },
  { href: "/people", icon: <Users size={20} />, label: "People", resolveHref: getBrowseReturnUrl },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/labels", icon: <Building2 size={20} />, label: "Labels" },
  { href: "/channels", icon: <Radio size={20} />, label: "Channels" },
  { href: "/artists", icon: <Palette size={20} />, label: "Artists" },
  { href: "/networks", icon: <Network size={20} />, label: "Networks" },
  { href: "/import", icon: <Upload size={20} />, label: "Import" },
  { href: "/staging-sets", icon: <Layers size={20} />, label: "Staging Sets" },
  { href: "/media-queue", icon: <HardDrive size={20} />, label: "Media Queue" },
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

      {/* Logout button */}
      <div className={cn("border-t border-white/10 p-3", collapsed && "px-2")}>
        <button
          onClick={() => logoutAction()}
          title="Sign out"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut size={20} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
