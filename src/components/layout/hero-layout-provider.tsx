"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "pulseboard-hero-layout";

export type HeroLayout = "spacious" | "standard" | "compact";

type HeroLayoutContextValue = {
  layout: HeroLayout;
  setLayout: (layout: HeroLayout) => void;
};

const HeroLayoutContext = createContext<HeroLayoutContextValue | null>(null);

const VALID_LAYOUTS: HeroLayout[] = [
  "spacious",
  "standard",
  "compact",
];

type HeroLayoutProviderProps = {
  children: React.ReactNode;
};

export function HeroLayoutProvider({ children }: HeroLayoutProviderProps) {
  const [layout, setLayoutState] = useState<HeroLayout>("standard");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_LAYOUTS.includes(stored as HeroLayout)) {
      startTransition(() => setLayoutState(stored as HeroLayout));
    }
  }, []);

  const setLayout = useCallback((newLayout: HeroLayout) => {
    setLayoutState(newLayout);
    localStorage.setItem(STORAGE_KEY, newLayout);
  }, []);

  return (
    <HeroLayoutContext.Provider value={{ layout, setLayout }}>
      {children}
    </HeroLayoutContext.Provider>
  );
}

export function useHeroLayout() {
  const context = useContext(HeroLayoutContext);
  if (!context) {
    throw new Error(
      "useHeroLayout must be used within a HeroLayoutProvider",
    );
  }
  return context;
}
