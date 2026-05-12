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
export type CoverAspect = "landscape" | "portrait";

const KEYS = {
  people: "pulseboard-people-layout",
  sets: "pulseboard-sets-layout",
  sessions: "pulseboard-sessions-layout",
  setsCoverAspect: "pulseboard-sets-cover-aspect",
  sessionsCoverAspect: "pulseboard-sessions-cover-aspect",
} as const;

type BrowserLayoutContextValue = {
  peopleLayout: BrowserLayoutMode;
  setsLayout: BrowserLayoutMode;
  sessionsLayout: BrowserLayoutMode;
  setsCoverAspect: CoverAspect;
  sessionsCoverAspect: CoverAspect;
  setPeopleLayout: (mode: BrowserLayoutMode) => void;
  setSetsLayout: (mode: BrowserLayoutMode) => void;
  setSessionsLayout: (mode: BrowserLayoutMode) => void;
  setSetsCoverAspect: (aspect: CoverAspect) => void;
  setSessionsCoverAspect: (aspect: CoverAspect) => void;
};

const BrowserLayoutContext = createContext<BrowserLayoutContextValue | null>(null);

type BrowserLayoutProviderProps = {
  children: React.ReactNode;
};

export function BrowserLayoutProvider({ children }: BrowserLayoutProviderProps) {
  const [peopleLayout, setPeopleLayoutState] = useState<BrowserLayoutMode>("poster");
  const [setsLayout, setSetsLayoutState] = useState<BrowserLayoutMode>("poster");
  const [sessionsLayout, setSessionsLayoutState] = useState<BrowserLayoutMode>("poster");
  const [setsCoverAspect, setSetsCoverAspectState] = useState<CoverAspect>("landscape");
  const [sessionsCoverAspect, setSessionsCoverAspectState] = useState<CoverAspect>("landscape");

  useEffect(() => {
    const people = localStorage.getItem(KEYS.people);
    const sets = localStorage.getItem(KEYS.sets);
    const sessions = localStorage.getItem(KEYS.sessions);
    const setsAspect = localStorage.getItem(KEYS.setsCoverAspect);
    const sessionsAspect = localStorage.getItem(KEYS.sessionsCoverAspect);
    if (people === "poster" || people === "strip") {
      startTransition(() => setPeopleLayoutState(people));
    }
    if (sets === "poster" || sets === "strip") {
      startTransition(() => setSetsLayoutState(sets));
    }
    if (sessions === "poster" || sessions === "strip") {
      startTransition(() => setSessionsLayoutState(sessions));
    }
    if (setsAspect === "landscape" || setsAspect === "portrait") {
      startTransition(() => setSetsCoverAspectState(setsAspect));
    }
    if (sessionsAspect === "landscape" || sessionsAspect === "portrait") {
      startTransition(() => setSessionsCoverAspectState(sessionsAspect));
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

  const setSetsCoverAspect = useCallback((aspect: CoverAspect) => {
    setSetsCoverAspectState(aspect);
    localStorage.setItem(KEYS.setsCoverAspect, aspect);
  }, []);

  const setSessionsCoverAspect = useCallback((aspect: CoverAspect) => {
    setSessionsCoverAspectState(aspect);
    localStorage.setItem(KEYS.sessionsCoverAspect, aspect);
  }, []);

  return (
    <BrowserLayoutContext.Provider
      value={{
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
