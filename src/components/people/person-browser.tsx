"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonCard } from "./person-card";
import { EmptyState } from "./empty-state";
import { useDensity } from "@/components/layout/density-provider";
import { loadMorePersons } from "@/lib/actions/people-browse-actions";
import type { PersonBrowserItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type PersonBrowserProps = {
  initialItems: PersonBrowserItem[];
  initialCursor: string | null;
  query: string;
  role: string;
  traitCategory: string;
};

type SavedState = {
  items: PersonBrowserItem[];
  nextCursor: string | null;
  scrollY: number;
};

function storageKey(query: string, role: string, traitCategory: string) {
  return `people-browse-${query}-${role}-${traitCategory}`;
}

export function PersonBrowser({
  initialItems,
  initialCursor,
  query,
  role,
  traitCategory,
}: PersonBrowserProps) {
  const { density } = useDensity();
  const [items, setItems] = useState<PersonBrowserItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const restoredRef = useRef(false);

  // Restore from sessionStorage on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const key = storageKey(query, role, traitCategory);
    const raw = sessionStorage.getItem(key);
    if (!raw) return;

    try {
      const saved: SavedState = JSON.parse(raw);
      // Restore dates (JSON.parse loses Date objects)
      const restored = saved.items.map((item) => ({
        ...item,
        birthdate: item.birthdate ? new Date(item.birthdate) : null,
      }));
      setItems(restored);
      setNextCursor(saved.nextCursor);
      // Restore scroll after React renders
      requestAnimationFrame(() => {
        window.scrollTo(0, saved.scrollY);
      });
    } catch {
      sessionStorage.removeItem(key);
    }
  }, [query, role, traitCategory]);

  // Reset when filters change (new initial data from server)
  const prevFiltersRef = useRef(`${query}-${role}-${traitCategory}`);
  useEffect(() => {
    const currentKey = `${query}-${role}-${traitCategory}`;
    if (prevFiltersRef.current !== currentKey) {
      prevFiltersRef.current = currentKey;
      setItems(initialItems);
      setNextCursor(initialCursor);
      restoredRef.current = true; // skip restore
      sessionStorage.removeItem(storageKey(query, role, traitCategory));
    }
  }, [query, role, traitCategory, initialItems, initialCursor]);

  // Save state before navigating to a card
  const saveState = useCallback(() => {
    const key = storageKey(query, role, traitCategory);
    const state: SavedState = {
      items,
      nextCursor,
      scrollY: window.scrollY,
    };
    sessionStorage.setItem(key, JSON.stringify(state));
  }, [items, nextCursor, query, role, traitCategory]);

  // Listen for clicks on person cards → save state
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const link = target.closest("[role='link']");
      if (link) {
        saveState();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [saveState]);

  async function handleLoadMore() {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const page = await loadMorePersons(
        query || undefined,
        role || undefined,
        traitCategory || undefined,
        nextCursor,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setIsLoading(false);
    }
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Showing {items.length} {items.length === 1 ? "person" : "people"}
        {nextCursor && " — more available"}
      </p>

      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
          density === "comfortable" ? "gap-3" : "gap-2",
        )}
      >
        {items.map((person) => (
          <PersonCard key={person.id} person={person} density={density} />
        ))}
      </div>

      {nextCursor && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="min-w-[160px]"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
