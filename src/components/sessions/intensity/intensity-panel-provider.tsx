"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { INTENSITY_PANEL_COOKIE } from "./types";

// Whether the intensity panel sits beside a session's photos. Remembered in a
// cookie, so the server renders the page as it was left — open stays open from
// session to session, with no jump after load.

type IntensityPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const IntensityPanelContext = createContext<IntensityPanelContextValue | null>(null);

export type IntensityPanelProviderProps = {
  /** From the cookie, read by the page */
  initialOpen: boolean;
  children: React.ReactNode;
};

export function IntensityPanelProvider({ initialOpen, children }: IntensityPanelProviderProps) {
  const [open, setOpenState] = useState(initialOpen);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      document.cookie = `${INTENSITY_PANEL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // not remembered — fine
    }
  }, []);

  return <IntensityPanelContext.Provider value={{ open, setOpen }}>{children}</IntensityPanelContext.Provider>;
}

export function useIntensityPanel() {
  const context = useContext(IntensityPanelContext);
  if (!context) throw new Error("useIntensityPanel must be used within an IntensityPanelProvider");
  return context;
}
