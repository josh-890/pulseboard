"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useState } from "react";

// Whether the settings navigation (the section list and the catalogs list) is
// folded away to give wide editors like the intensity catalog more room.
// Remembered per browser; storage may be unavailable, so every access is guarded.

const STORAGE_KEY = "pulseboard-settings-nav-collapsed";

type SettingsNavContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const SettingsNavContext = createContext<SettingsNavContextValue | null>(null);

export type SettingsNavProviderProps = {
  children: React.ReactNode;
};

export function SettingsNavProvider({ children }: SettingsNavProviderProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") startTransition(() => setCollapsed(true));
    } catch {
      // no storage — start expanded
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // not remembered — fine
      }
      return next;
    });
  }, []);

  return <SettingsNavContext.Provider value={{ collapsed, toggle }}>{children}</SettingsNavContext.Provider>;
}

export function useSettingsNav() {
  const context = useContext(SettingsNavContext);
  if (!context) throw new Error("useSettingsNav must be used within a SettingsNavProvider");
  return context;
}
