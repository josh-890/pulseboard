"use client";

import { LayoutGrid, LayoutList, RectangleHorizontal, RectangleVertical } from "lucide-react";
import {
  useBrowserLayout,
  type BrowserLayoutMode,
  type CoverAspect,
} from "@/components/layout/browser-layout-provider";
import { cn } from "@/lib/utils";

type Entity = "people" | "sets" | "sessions";
type CoverEntity = "sets" | "sessions";

const ENTITY_LABELS: Record<Entity, string> = {
  people: "People Browser",
  sets: "Sets Browser",
  sessions: "Sessions Browser",
};

const MODE_META: Record<BrowserLayoutMode, { label: string; description: string }> = {
  poster: { label: "Poster", description: "Vertical cards, image dominant" },
  strip: { label: "Classic", description: "Horizontal strip with thumbnail" },
};

const ASPECT_META: Record<CoverAspect, { label: string; description: string }> = {
  landscape: { label: "Landscape", description: "4:3 — wider than tall" },
  portrait: { label: "Portrait", description: "2:3 — taller than wide" },
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

function CoverAspectRow({
  entity: _entity,
  aspect,
  setAspect,
  layout,
}: {
  entity: CoverEntity;
  aspect: CoverAspect;
  setAspect: (a: CoverAspect) => void;
  layout: BrowserLayoutMode;
}) {
  const isDisabled = layout !== "poster";
  return (
    <div className={cn("space-y-2 pl-3 border-l-2 border-border", isDisabled && "opacity-40 pointer-events-none")}>
      <p className="text-xs font-medium text-muted-foreground">Cover image shape</p>
      <div className="flex gap-3">
        {(["landscape", "portrait"] as CoverAspect[]).map((a) => {
          const selected = aspect === a;
          const Icon = a === "landscape" ? RectangleHorizontal : RectangleVertical;
          const meta = ASPECT_META[a];
          return (
            <button
              key={a}
              type="button"
              onClick={() => setAspect(a)}
              disabled={isDisabled}
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
    setsCoverAspect,
    sessionsCoverAspect,
    setPeopleLayout,
    setSetsLayout,
    setSessionsLayout,
    setSetsCoverAspect,
    setSessionsCoverAspect,
  } = useBrowserLayout();

  return (
    <div className="space-y-6">
      <LayoutRow entity="people" layout={peopleLayout} setLayout={setPeopleLayout} />

      <div className="space-y-3">
        <LayoutRow entity="sets" layout={setsLayout} setLayout={setSetsLayout} />
        <CoverAspectRow
          entity="sets"
          aspect={setsCoverAspect}
          setAspect={setSetsCoverAspect}
          layout={setsLayout}
        />
      </div>

      <div className="space-y-3">
        <LayoutRow entity="sessions" layout={sessionsLayout} setLayout={setSessionsLayout} />
        <CoverAspectRow
          entity="sessions"
          aspect={sessionsCoverAspect}
          setAspect={setSessionsCoverAspect}
          layout={sessionsLayout}
        />
      </div>
    </div>
  );
}
