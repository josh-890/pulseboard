"use client";

import {
  useHeroLayout,
  type HeroLayout,
} from "@/components/layout/hero-layout-provider";
import { cn } from "@/lib/utils";

type LayoutOption = {
  value: HeroLayout;
  label: string;
  description: string;
};

const options: LayoutOption[] = [
  {
    value: "spacious",
    label: "Spacious",
    description: "Generous padding and larger photo for a relaxed feel",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Balanced density — good default for most screens",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Tighter spacing to show more info at a glance",
  },
];

function DensityPreview({ density }: { density: HeroLayout }) {
  const gapClass =
    density === "spacious" ? "gap-1.5" : density === "standard" ? "gap-1" : "gap-0.5";
  const photoW =
    density === "spacious" ? "w-14" : density === "standard" ? "w-12" : "w-10";
  const photoH =
    density === "spacious" ? "h-[72px]" : density === "standard" ? "h-16" : "h-14";
  const padClass =
    density === "spacious" ? "p-2" : density === "standard" ? "p-1.5" : "p-1";

  return (
    <div
      className={cn(
        "flex rounded-md border border-white/10 bg-black/10 dark:bg-white/5",
        gapClass,
        padClass,
      )}
    >
      {/* Photo */}
      <div className={cn("shrink-0 rounded bg-primary/20", photoW, photoH)} />
      {/* Identity */}
      <div className={cn("flex w-12 shrink-0 flex-col justify-center", gapClass)}>
        <div className="h-3 rounded bg-primary/15" />
        <div className="h-2 w-3/4 rounded bg-accent/15" />
        <div className="h-2 w-1/2 rounded bg-accent/10" />
      </div>
      {/* Basic Info */}
      <div className={cn("flex flex-1 flex-col justify-center", gapClass)}>
        <div className="h-2 rounded bg-accent/20" />
        <div className="h-2 w-5/6 rounded bg-accent/15" />
        <div className="h-2 w-3/4 rounded bg-accent/10" />
      </div>
      {/* Physical Stats */}
      <div className={cn("flex flex-1 flex-col justify-center", gapClass)}>
        <div className="h-2 rounded bg-accent/20" />
        <div className="h-2 w-4/5 rounded bg-accent/15" />
        <div className="h-2 w-3/5 rounded bg-accent/10" />
      </div>
      {/* KPI */}
      <div className={cn("flex w-10 shrink-0 flex-col justify-center", gapClass)}>
        <div className="grid grid-cols-2 gap-0.5">
          <div className="h-3 rounded bg-muted/50" />
          <div className="h-3 rounded bg-muted/50" />
          <div className="h-3 rounded bg-muted/50" />
          <div className="h-3 rounded bg-muted/50" />
        </div>
        <div className="h-1.5 rounded bg-muted/30" />
      </div>
    </div>
  );
}

export function HeroLayoutSelector() {
  const { layout, setLayout } = useHeroLayout();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const selected = layout === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLayout(opt.value)}
            className={cn(
              "flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-all duration-150",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            <DensityPreview density={opt.value} />
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">
                {opt.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
