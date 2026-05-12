"use client";

import { LayoutGrid, LayoutList } from "lucide-react";
import { useBrowserLayout, type BrowserLayoutMode } from "@/components/layout/browser-layout-provider";
import { cn } from "@/lib/utils";

type Entity = "people" | "sets" | "sessions";

const ENTITY_LABELS: Record<Entity, string> = {
  people: "People Browser",
  sets: "Sets Browser",
  sessions: "Sessions Browser",
};

const MODE_META: Record<BrowserLayoutMode, { label: string; description: string }> = {
  poster: { label: "Poster", description: "Vertical cards, image dominant" },
  strip: { label: "Classic", description: "Horizontal strip with thumbnail" },
};

function LayoutRow({
  entity,
  layout,
  setLayout,
}: {
  entity: Entity;
  layout: BrowserLayoutMode;
  setLayout: (mode: BrowserLayoutMode) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{ENTITY_LABELS[entity]}</p>
      <div className="flex gap-3">
        {(["poster", "strip"] as BrowserLayoutMode[]).map((mode) => {
          const selected = layout === mode;
          const Icon = mode === "poster" ? LayoutGrid : LayoutList;
          const meta = MODE_META[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setLayout(mode)}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150",
                selected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-primary/50",
              )}
            >
              <Icon
                size={18}
                className={cn(selected ? "text-primary" : "text-muted-foreground")}
              />
              <div>
                <p className="text-sm font-medium">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BrowserLayoutSelector() {
  const {
    peopleLayout,
    setsLayout,
    sessionsLayout,
    setPeopleLayout,
    setSetsLayout,
    setSessionsLayout,
  } = useBrowserLayout();

  return (
    <div className="space-y-5">
      <LayoutRow entity="people" layout={peopleLayout} setLayout={setPeopleLayout} />
      <LayoutRow entity="sets" layout={setsLayout} setLayout={setSetsLayout} />
      <LayoutRow entity="sessions" layout={sessionsLayout} setLayout={setSessionsLayout} />
    </div>
  );
}
