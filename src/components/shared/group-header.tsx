"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type GroupHeaderProps = {
  label: string;
  count: number;
  level?: 1 | 2;
  collapsed: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  className?: string;
};

export function GroupHeader({
  label,
  count,
  level = 1,
  collapsed,
  onToggle,
  icon,
  className,
}: GroupHeaderProps) {
  if (level === 2) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 py-1.5 pl-1 text-left transition-colors",
          "text-xs text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        {collapsed ? (
          <ChevronRight size={11} className="shrink-0" />
        ) : (
          <ChevronDown size={11} className="shrink-0" />
        )}
        {icon}
        <span className="font-medium">{label}</span>
        <span className="text-[10px] tabular-nums opacity-50">{count}</span>
        <div className="ml-2 flex-1 border-t border-dashed border-white/10" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border border-white/8 px-3 py-2.5 text-left",
        "bg-card/60 backdrop-blur-sm transition-colors hover:bg-card/80",
        "sticky top-0 z-10",
        className,
      )}
    >
      {collapsed ? (
        <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
      ) : (
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      )}
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  );
}
