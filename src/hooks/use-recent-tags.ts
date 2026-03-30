"use client";

import { useCallback, useEffect, useState } from "react";
import type { TagChipData } from "@/components/shared/tag-chips";

const MAX_RECENT = 20;
const DISPLAY_LIMIT = 5;

function getStorageKey(scope: string): string {
  return `pulseboard:recent-tags:${scope}`;
}

function readFromStorage(scope: string): TagChipData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) return [];
    return JSON.parse(raw) as TagChipData[];
  } catch {
    return [];
  }
}

function writeToStorage(scope: string, tags: TagChipData[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(scope), JSON.stringify(tags.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage errors
  }
}

export function useRecentTags(scope: string): {
  recentTags: TagChipData[];
  addRecent: (tag: TagChipData) => void;
} {
  const [recentTags, setRecentTags] = useState<TagChipData[]>([]);

  // Load from localStorage on mount (SSR-safe)
  useEffect(() => {
    setRecentTags(readFromStorage(scope));
  }, [scope]);

  const addRecent = useCallback(
    (tag: TagChipData) => {
      setRecentTags((prev) => {
        const filtered = prev.filter((t) => t.id !== tag.id);
        const updated = [tag, ...filtered].slice(0, MAX_RECENT);
        writeToStorage(scope, updated);
        return updated;
      });
    },
    [scope],
  );

  return {
    recentTags: recentTags.slice(0, DISPLAY_LIMIT),
    addRecent,
  };
}
