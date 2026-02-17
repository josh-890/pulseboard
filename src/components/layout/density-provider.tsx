"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "pulseboard-density";

export type DensityMode = "comfortable" | "compact";

type DensityContextValue = {
  density: DensityMode;
  setDensity: (mode: DensityMode) => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);

type DensityProviderProps = {
  children: React.ReactNode;
};

export function DensityProvider({ children }: DensityProviderProps) {
  const [density, setDensityState] = useState<DensityMode>("comfortable");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "comfortable" || stored === "compact") {
      setDensityState(stored);
    }
  }, []);

  const setDensity = useCallback((mode: DensityMode) => {
    setDensityState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (!context) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
}
