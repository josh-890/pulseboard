"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { getPaletteByName } from "@/lib/palettes";
import type { PaletteModeConfig } from "@/lib/types/palette";

const STORAGE_KEY = "pulseboard-palette";

type PaletteContextValue = {
  paletteName: string;
  setPalette: (name: string) => void;
};

const PaletteContext = createContext<PaletteContextValue | null>(null);

const CSS_VAR_MAP: Record<keyof Omit<PaletteModeConfig, "backgroundGradient">, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
};

function applyPaletteVars(config: PaletteModeConfig) {
  const el = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    el.style.setProperty(cssVar, config[key as keyof typeof CSS_VAR_MAP]);
  }
  document.body.style.background = config.backgroundGradient;
}

function clearPaletteVars() {
  const el = document.documentElement;
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    el.style.removeProperty(cssVar);
  }
  document.body.style.removeProperty("background");
}

type PaletteProviderProps = {
  children: React.ReactNode;
};

export function PaletteProvider({ children }: PaletteProviderProps) {
  const { resolvedTheme } = useTheme();
  const [paletteName, setPaletteNameState] = useState("Default");

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && getPaletteByName(stored)) {
      setPaletteNameState(stored);
    }
  }, []);

  const setPalette = useCallback((name: string) => {
    setPaletteNameState(name);
    localStorage.setItem(STORAGE_KEY, name);
  }, []);

  // Apply CSS variables when palette or theme changes
  useEffect(() => {
    if (paletteName === "Default") {
      clearPaletteVars();
      return;
    }

    const palette = getPaletteByName(paletteName);
    if (!palette) {
      clearPaletteVars();
      return;
    }

    const mode = resolvedTheme === "dark" ? "dark" : "light";
    applyPaletteVars(palette[mode]);
  }, [paletteName, resolvedTheme]);

  return (
    <PaletteContext.Provider value={{ paletteName, setPalette }}>
      {children}
    </PaletteContext.Provider>
  );
}

export function usePalette() {
  const context = useContext(PaletteContext);
  if (!context) {
    throw new Error("usePalette must be used within a PaletteProvider");
  }
  return context;
}
