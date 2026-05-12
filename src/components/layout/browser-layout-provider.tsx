"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type BrowserLayoutMode = "poster" | "strip";

const KEYS = {
  people: "pulseboard-people-layout",
  sets: "pulseboard-sets-layout",
  sessions: "pulseboard-sessions-layout",
} as const;

type BrowserLayoutContextValue = {
  peopleLayout: BrowserLayoutMode;
  setsLayout: BrowserLayoutMode;
  sessionsLayout: BrowserLayoutMode;
  setPeopleLayout: (mode: BrowserLayoutMode) => void;
  setSetsLayout: (mode: BrowserLayoutMode) => void;
  setSessionsLayout: (mode: BrowserLayoutMode) => void;
};

const BrowserLayoutContext = createContext<BrowserLayoutContextValue | null>(null);

type BrowserLayoutProviderProps = {
  children: React.ReactNode;
};

export function BrowserLayoutProvider({ children }: BrowserLayoutProviderProps) {
  const [peopleLayout, setPeopleLayoutState] = useState<BrowserLayoutMode>("poster");
  const [setsLayout, setSetsLayoutState] = useState<BrowserLayoutMode>("poster");
  const [sessionsLayout, setSessionsLayoutState] = useState<BrowserLayoutMode>("poster");

  useEffect(() => {
    const people = localStorage.getItem(KEYS.people);
    const sets = localStorage.getItem(KEYS.sets);
    const sessions = localStorage.getItem(KEYS.sessions);
    if (people === "poster" || people === "strip") {
      startTransition(() => setPeopleLayoutState(people));
    }
    if (sets === "poster" || sets === "strip") {
      startTransition(() => setSetsLayoutState(sets));
    }
    if (sessions === "poster" || sessions === "strip") {
      startTransition(() => setSessionsLayoutState(sessions));
    }
  }, []);

  const setPeopleLayout = useCallback((mode: BrowserLayoutMode) => {
    setPeopleLayoutState(mode);
    localStorage.setItem(KEYS.people, mode);
  }, []);

  const setSetsLayout = useCallback((mode: BrowserLayoutMode) => {
    setSetsLayoutState(mode);
    localStorage.setItem(KEYS.sets, mode);
  }, []);

  const setSessionsLayout = useCallback((mode: BrowserLayoutMode) => {
    setSessionsLayoutState(mode);
    localStorage.setItem(KEYS.sessions, mode);
  }, []);

  return (
    <BrowserLayoutContext.Provider
      value={{
        peopleLayout,
        setsLayout,
        sessionsLayout,
        setPeopleLayout,
        setSetsLayout,
        setSessionsLayout,
      }}
    >
      {children}
    </BrowserLayoutContext.Provider>
  );
}

export function useBrowserLayout() {
  const context = useContext(BrowserLayoutContext);
  if (!context) {
    throw new Error("useBrowserLayout must be used within a BrowserLayoutProvider");
  }
  return context;
}
