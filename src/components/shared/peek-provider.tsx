"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PeekSheet } from "./peek-sheet";

export type PeekType = "person" | "set";

export type PeekList = {
  type: PeekType;
  /** The list's title, e.g. "FemJoy · Sets" */
  title: string;
  ids: string[];
  names: string[];
  index: number;
  /** Goes to that entity's page, on the list's track (`?via=`) */
  open: (id: string) => void;
};

type PeekContextValue = { openPeek: (list: PeekList) => void };

const PeekContext = createContext<PeekContextValue | null>(null);

/** The open Peek, if any; null outside the app shell */
export function usePeek(): PeekContextValue | null {
  return useContext(PeekContext);
}

type PeekProviderProps = { children: ReactNode };

/**
 * Peek (2026-11-13): a list can be looked through in a side panel without
 * leaving it — Space on a focused person or set, or the eye on hover, inside
 * any TrailScope. The provider holds the open list; PeekSheet shows it.
 */
export function PeekProvider({ children }: PeekProviderProps) {
  const [list, setList] = useState<PeekList | null>(null);
  // Each opening is a fresh panel (fresh cards, nothing stale from last time).
  const [session, setSession] = useState(0);
  const openPeek = useCallback((next: PeekList) => {
    setSession((n) => n + 1);
    setList(next);
  }, []);
  const value = useMemo(() => ({ openPeek }), [openPeek]);

  return (
    <PeekContext.Provider value={value}>
      {children}
      <PeekSheet
        key={session}
        list={list}
        onIndex={(index) => setList((l) => (l ? { ...l, index } : l))}
        onClose={() => setList(null)}
      />
    </PeekContext.Provider>
  );
}
