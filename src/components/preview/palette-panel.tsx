"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { PaletteConfig, PaletteModeConfig } from "@/lib/types/palette";

type PalettePanelProps = {
  palette: PaletteConfig;
  mode: "light" | "dark";
};

function modeConfigToStyle(config: PaletteModeConfig): CSSProperties {
  return {
    "--background": config.background,
    "--foreground": config.foreground,
    "--card": config.card,
    "--card-foreground": config.cardForeground,
    "--popover": config.popover,
    "--popover-foreground": config.popoverForeground,
    "--primary": config.primary,
    "--primary-foreground": config.primaryForeground,
    "--secondary": config.secondary,
    "--secondary-foreground": config.secondaryForeground,
    "--muted": config.muted,
    "--muted-foreground": config.mutedForeground,
    "--accent": config.accent,
    "--accent-foreground": config.accentForeground,
    "--destructive": config.destructive,
    "--border": config.border,
    "--input": config.input,
    "--ring": config.ring,
    color: config.foreground,
    backgroundColor: config.background,
  } as CSSProperties;
}

type SwatchProps = {
  color: string;
  label: string;
  isDark: boolean;
};

function Swatch({ color, label, isDark }: SwatchProps) {
  const shadowBase = isDark ? "0,0,0" : "0,0,0";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="size-9 rounded-xl border border-border transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-110"
        style={{
          backgroundColor: color,
          boxShadow: `0 2px 4px rgba(${shadowBase},0.1), 0 4px 8px rgba(${shadowBase},0.08), inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
        title={`${label}: ${color}`}
        aria-label={`${label}: ${color}`}
      />
      <span className="text-[10px] leading-none" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </span>
    </div>
  );
}

export function PalettePanel({ palette, mode }: PalettePanelProps) {
  const config = mode === "light" ? palette.light : palette.dark;
  const isDark = mode === "dark";
  const style = modeConfigToStyle(config);

  // Shadow layers for 3D depth
  const panelShadow = isDark
    ? "0 4px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
    : "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)";

  const cardShadow = isDark
    ? "0 8px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)"
    : "0 8px 24px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)";

  const kpiShadow = isDark
    ? "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)"
    : "0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)";

  const progressTrackShadow = isDark
    ? "inset 0 2px 4px rgba(0,0,0,0.4)"
    : "inset 0 2px 4px rgba(0,0,0,0.1)";

  const progressBarShadow = isDark
    ? "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)"
    : "0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)";

  const inputShadow = isDark
    ? "inset 0 2px 4px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04)"
    : "inset 0 2px 4px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8)";

  const badgeShadow = isDark
    ? "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)"
    : "0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)";

  return (
    <section
      aria-label={`${palette.name} — ${mode} mode`}
      className="group rounded-2xl overflow-hidden relative p-5 md:p-6 transition-all duration-300 ease-out hover:-translate-y-1"
      style={{
        ...style,
        boxShadow: panelShadow,
        perspective: "800px",
      }}
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0 -z-10"
        style={{ background: config.backgroundGradient }}
        aria-hidden="true"
      />

      {/* Header: Name + Mode badge */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3
            className="text-lg font-semibold leading-tight"
            style={{ color: config.foreground }}
          >
            {palette.name}
          </h3>
          <p
            className="mt-1 text-sm leading-snug"
            style={{ color: config.mutedForeground }}
          >
            {palette.description}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
            color: config.foreground,
            boxShadow: isDark
              ? "0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)"
              : "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          {mode}
        </span>
      </div>

      {/* Color swatches */}
      <div className="mb-5 flex gap-3" role="group" aria-label="Color swatches">
        <Swatch color={config.primary} label="Primary" isDark={isDark} />
        <Swatch color={config.secondary} label="Secondary" isDark={isDark} />
        <Swatch color={config.accent} label="Accent" isDark={isDark} />
        <Swatch color={config.destructive} label="Danger" isDark={isDark} />
        <Swatch color={config.muted} label="Muted" isDark={isDark} />
      </div>

      {/* Glassmorphic card — elevated with layered shadow */}
      <div
        className="bg-card/70 backdrop-blur-md border border-border rounded-2xl p-5 space-y-4 transition-all duration-300 ease-out group-hover:translate-y-[-2px]"
        style={{ boxShadow: cardShadow }}
      >
        {/* KPI row */}
        <div className="flex gap-3">
          {[
            { value: "12", label: "Projects", color: config.primary },
            { value: "8", label: "Members", color: config.primary },
            { value: "94%", label: "On Track", color: config.accent },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex-1 rounded-xl p-3 transition-all duration-200 ease-out hover:-translate-y-0.5"
              style={{
                backgroundColor: config.muted,
                boxShadow: kpiShadow,
              }}
            >
              <p
                className="text-2xl font-bold leading-none"
                style={{ color: kpi.color }}
              >
                {kpi.value}
              </p>
              <p
                className="mt-1 text-xs"
                style={{ color: config.mutedForeground }}
              >
                {kpi.label}
              </p>
            </div>
          ))}
        </div>

        {/* Progress bar — inset track, raised fill */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: config.cardForeground }}>
              Sprint Progress
            </span>
            <span className="text-xs" style={{ color: config.mutedForeground }}>
              72%
            </span>
          </div>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{
              backgroundColor: config.muted,
              boxShadow: progressTrackShadow,
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: "72%",
                backgroundColor: config.primary,
                boxShadow: progressBarShadow,
              }}
            />
          </div>
        </div>

        {/* Buttons — 3D raised effect */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { variant: "default", label: "Primary" },
              { variant: "secondary", label: "Secondary" },
              { variant: "destructive", label: "Destructive" },
              { variant: "outline", label: "Outline" },
            ] as const
          ).map((btn) => (
            <Button
              key={btn.variant}
              variant={btn.variant}
              size="sm"
              className="transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0"
              style={{
                boxShadow: isDark
                  ? "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)"
                  : "0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        {/* Badges with status dots + 3D pill effect */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" style={{ boxShadow: badgeShadow }}>
            <span
              className="mr-1 inline-block size-1.5 rounded-full"
              style={{ backgroundColor: config.primaryForeground }}
              aria-hidden="true"
            />
            Active
          </Badge>
          <Badge variant="secondary" style={{ boxShadow: badgeShadow }}>
            <span
              className="mr-1 inline-block size-1.5 rounded-full"
              style={{ backgroundColor: config.secondaryForeground }}
              aria-hidden="true"
            />
            In Review
          </Badge>
          <Badge
            className="border-transparent"
            style={{
              backgroundColor: config.accent,
              color: config.accentForeground,
              boxShadow: badgeShadow,
            }}
          >
            <span
              className="mr-1 inline-block size-1.5 rounded-full"
              style={{ backgroundColor: config.accentForeground }}
              aria-hidden="true"
            />
            Featured
          </Badge>
          <Badge variant="outline" style={{ boxShadow: badgeShadow }}>
            Draft
          </Badge>
        </div>

        {/* Input — inset 3D field */}
        <div>
          <label
            className="mb-1.5 block text-xs font-medium"
            style={{ color: config.cardForeground }}
          >
            Search
          </label>
          <Input
            placeholder="Filter projects..."
            style={{ boxShadow: inputShadow }}
          />
        </div>

        {/* Muted timestamp */}
        <p className="text-xs" style={{ color: config.mutedForeground }}>
          Last updated 2 hours ago
        </p>
      </div>
    </section>
  );
}
