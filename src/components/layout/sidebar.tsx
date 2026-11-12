"use client";

import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { NavSections } from "./nav-sections";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth-actions";

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

      <div className={cn("px-6 pb-3 pt-5", collapsed && "flex justify-center px-2")}>
        {collapsed ? (
          <span className="text-xl font-bold text-foreground">P</span>
        ) : (
          <h1 className="text-xl font-bold text-foreground">Pulseboard</h1>
        )}
      </div>

      <nav aria-label="Main" className={cn("flex flex-1 flex-col overflow-y-auto pb-3", collapsed ? "px-2" : "px-3")}>
        <NavSections part="main" collapsed={collapsed} />
      </nav>

      {/* System pages + sign-out, pinned to the foot (sign-out is an icon beside them) */}
      <div
        className={cn(
          "flex border-t border-foreground/15 px-3 py-2",
          collapsed ? "flex-col gap-0.5 px-2" : "items-end gap-1",
        )}
      >
        <nav aria-label="System" className="min-w-0 flex-1">
          <NavSections part="bottom" collapsed={collapsed} />
        </nav>
        <button
          onClick={() => logoutAction()}
          title="Sign out"
          aria-label="Sign out"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "px-2" : "px-2.5",
          )}
        >
          <LogOut size={20} />
        </button>
      </div>
    </aside>
  );
}
