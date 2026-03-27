"use client";

import { useEffect } from "react";

/**
 * Registers a document-level ESC key handler that closes the caller.
 *
 * Uses stopImmediatePropagation so that when overlays are nested (e.g. a body-region
 * picker inside a sheet), only the innermost overlay handles the key — React child
 * effects run before parent effects, so the child registers its handler first and
 * fires first in FIFO order.  Propagation to the window-level BrowseNavBar handler
 * is also prevented, so ESC never triggers page navigation while any overlay is open.
 */
export function useEscToClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}
