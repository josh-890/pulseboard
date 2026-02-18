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
  photoTag?: string;
};

type SavedState = {
  items: PersonBrowserItem[];
  nextCursor: string | null;
  scrollY: number;
  /** Fingerprint of the first page IDs — used to detect stale data */
  firstPageFingerprint?: string;
};

function storageKey(
  query: string,
  role: string,
  traitCategory: string,
  photoTag: string,
) {
  return `people-browse-${query}-${role}-${traitCategory}-${photoTag}`;
}

/** Build a fingerprint from the first page of items to detect stale data */
function buildFingerprint(items: PersonBrowserItem[]): string {
  return items.map((i) => `${i.id}:${i.photoUrl ?? ""}`).join("|");
}

export function PersonBrowser({
  initialItems,
  initialCursor,
  query,
  role,
  traitCategory,
  photoTag = "p-img01",
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

    const key = storageKey(query, role, traitCategory, photoTag);
    const raw = sessionStorage.getItem(key);
    if (!raw) return;

    try {
      const saved: SavedState = JSON.parse(raw);

      // Check if the server data changed since we cached
      const currentFingerprint = buildFingerprint(initialItems);
      if (
        saved.firstPageFingerprint &&
        saved.firstPageFingerprint !== currentFingerprint
      ) {
        // Server data changed — discard stale cache
        sessionStorage.removeItem(key);
        return;
      }

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
  }, [query, role, traitCategory, photoTag, initialItems]);

  // Reset when filters change (new initial data from server)
  const prevFiltersRef = useRef(
    `${query}-${role}-${traitCategory}-${photoTag}`,
  );
  useEffect(() => {
    const currentKey = `${query}-${role}-${traitCategory}-${photoTag}`;
    if (prevFiltersRef.current !== currentKey) {
      prevFiltersRef.current = currentKey;
      setItems(initialItems);
      setNextCursor(initialCursor);
      restoredRef.current = true; // skip restore
      sessionStorage.removeItem(
        storageKey(query, role, traitCategory, photoTag),
      );
    }
  }, [query, role, traitCategory, photoTag, initialItems, initialCursor]);

  // Save state before navigating to a card
  const saveState = useCallback(() => {
    const key = storageKey(query, role, traitCategory, photoTag);
    const state: SavedState = {
      items,
      nextCursor,
      scrollY: window.scrollY,
      firstPageFingerprint: buildFingerprint(initialItems),
    };
    sessionStorage.setItem(key, JSON.stringify(state));
  }, [items, nextCursor, query, role, traitCategory, photoTag, initialItems]);

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
        photoTag,
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
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6",
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
