"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "pulseboard-sidebar-collapsed";

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

type SidebarProviderProps = {
  children: React.ReactNode;
};

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      startTransition(() => setCollapsedState(true));
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, toggleCollapsed }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
