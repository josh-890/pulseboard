"use client";

import { useCallback, useEffect, useRef } from "react";
import { useState } from "react";

type CollapseStorage = {
  defaultCollapsed: boolean;
  exceptions: string[];
};

type CollapseEntry = {
  groupBy: string;
  defaultCollapsed: boolean;
  exceptions: Set<string>;
};

function loadFromStorage(storageKey: string, groupBy: string): { defaultCollapsed: boolean; exceptions: Set<string> } {
  try {
    const raw = sessionStorage.getItem(`${storageKey}:${groupBy}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CollapseStorage;
      return { defaultCollapsed: parsed.defaultCollapsed, exceptions: new Set(parsed.exceptions) };
    }
  } catch {
    // sessionStorage unavailable
  }
  return { defaultCollapsed: false, exceptions: new Set() };
}

/**
 * Collapse state for grouped browser views.
 * When defaultCollapsed=false: exceptions = keys that are collapsed.
 * When defaultCollapsed=true:  exceptions = keys that are expanded.
 * This lets collapseAll/expandAll flip a single boolean without tracking every key.
 */
export function useCollapseState(storageKey: string, groupBy: string) {
  // Track groupBy in state so we can detect changes during render (derived state pattern)
  const [entry, setEntry] = useState<CollapseEntry>(() => ({
    groupBy,
    ...loadFromStorage(storageKey, groupBy),
  }));

  // When groupBy changes, re-derive from storage synchronously during render.
  // React allows setState calls during rendering as a special case for derived state.
  if (entry.groupBy !== groupBy) {
    setEntry({ groupBy, ...loadFromStorage(storageKey, groupBy) });
  }

  const { defaultCollapsed, exceptions } = entry;
  const skipSaveRef = useRef(true);

  // Reset skip flag whenever groupBy changes
  useEffect(() => {
    skipSaveRef.current = true;
  }, [groupBy]);

  // Persist whenever state changes (skip the initial value)
  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    try {
      const data: CollapseStorage = {
        defaultCollapsed,
        exceptions: Array.from(exceptions),
      };
      sessionStorage.setItem(`${storageKey}:${groupBy}`, JSON.stringify(data));
    } catch {
      // sessionStorage unavailable
    }
  }, [storageKey, groupBy, defaultCollapsed, exceptions]);

  const isCollapsed = useCallback(
    (key: string): boolean =>
      defaultCollapsed ? !exceptions.has(key) : exceptions.has(key),
    [defaultCollapsed, exceptions],
  );

  const toggle = useCallback((key: string) => {
    setEntry((prev) => {
      const next = new Set(prev.exceptions);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, exceptions: next };
    });
  }, []);

  const collapseAll = useCallback(() => {
    setEntry((prev) => ({ ...prev, defaultCollapsed: true, exceptions: new Set() }));
  }, []);

  const expandAll = useCallback(() => {
    setEntry((prev) => ({ ...prev, defaultCollapsed: false, exceptions: new Set() }));
  }, []);

  return { isCollapsed, toggle, collapseAll, expandAll, defaultCollapsed };
}
