"use client";

import { useCallback, useState, useTransition } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonMediaUsage } from "@/lib/types";
import type { CollectionSummary } from "@/lib/services/collection-service";
import {
  batchSetUsageAction,
} from "@/lib/actions/media-actions";
import {
  addToCollectionAction,
} from "@/lib/actions/collection-actions";

const USAGE_OPTIONS: { value: PersonMediaUsage; label: string }[] = [
  { value: "HEADSHOT", label: "Headshot" },
  { value: "REFERENCE", label: "Reference" },
  { value: "PROFILE", label: "Profile" },
  { value: "PORTFOLIO", label: "Portfolio" },
  { value: "BODY_MARK", label: "Body Mark" },
  { value: "BODY_MODIFICATION", label: "Modification" },
  { value: "COSMETIC_PROCEDURE", label: "Cosmetic" },
];

type MediaSelectionBarProps = {
  selectedIds: Set<string>;
  personId: string;
  sessionId: string;
  collections: CollectionSummary[];
  onClearSelection: () => void;
  onBatchComplete?: () => void;
};

export function MediaSelectionBar({
  selectedIds,
  personId,
  sessionId,
  collections,
  onClearSelection,
  onBatchComplete,
}: MediaSelectionBarProps) {
  const [isPending, startTransition] = useTransition();
  const [showUsageMenu, setShowUsageMenu] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const count = selectedIds.size;

  const handleSetUsage = useCallback(
    (usage: PersonMediaUsage) => {
      setShowUsageMenu(false);
      startTransition(async () => {
        await batchSetUsageAction(
          personId,
          Array.from(selectedIds),
          usage,
          sessionId,
        );
        onBatchComplete?.();
      });
    },
    [personId, selectedIds, sessionId, onBatchComplete],
  );

  const handleAddToCollection = useCallback(
    (collectionId: string) => {
      setShowCollectionMenu(false);
      startTransition(async () => {
        await addToCollectionAction(collectionId, Array.from(selectedIds));
        onBatchComplete?.();
      });
    },
    [selectedIds, onBatchComplete],
  );

  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-white/20 bg-card/95 px-5 py-3 shadow-2xl backdrop-blur-md",
          isPending && "opacity-70 pointer-events-none",
        )}
      >
        <span className="text-sm font-medium">
          {count} selected
        </span>

        {/* Set Usage dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowUsageMenu((p) => !p);
              setShowCollectionMenu(false);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-muted/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/90"
          >
            Set Usage
            <ChevronDown size={12} />
          </button>
          {showUsageMenu && (
            <div className="absolute bottom-full left-0 mb-2 min-w-[140px] rounded-lg border border-white/20 bg-card/95 py-1 shadow-lg backdrop-blur-md">
              {USAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSetUsage(opt.value)}
                  className="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add to Collection dropdown */}
        {collections.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowCollectionMenu((p) => !p);
                setShowUsageMenu(false);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-muted/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/90"
            >
              Add to
              <ChevronDown size={12} />
            </button>
            {showCollectionMenu && (
              <div className="absolute bottom-full left-0 mb-2 min-w-[160px] rounded-lg border border-white/20 bg-card/95 py-1 shadow-lg backdrop-blur-md">
                {collections.map((coll) => (
                  <button
                    key={coll.id}
                    type="button"
                    onClick={() => handleAddToCollection(coll.id)}
                    className="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
                  >
                    {coll.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Clear selection */}
        <button
          type="button"
          onClick={() => {
            setShowUsageMenu(false);
            setShowCollectionMenu(false);
            onClearSelection();
          }}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
