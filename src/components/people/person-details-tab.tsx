"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, ImageIcon, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";

type CategoryCount = {
  categoryId: string;
  count: number;
};

type CategoryMediaItem = {
  id: string;
  filename: string;
  urls: Record<string, string | null>;
  originalWidth: number;
  originalHeight: number;
};

type PersonDetailsTabProps = {
  personId: string;
  categories: CategoryWithGroup[];
  categoryCounts: CategoryCount[];
};

export function PersonDetailsTab({
  personId,
  categories,
  categoryCounts,
}: PersonDetailsTabProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [categoryMedia, setCategoryMedia] = useState<Map<string, CategoryMediaItem[]>>(new Map());
  const [, startLoadingTransition] = useTransition();

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cc of categoryCounts) {
      map.set(cc.categoryId, cc.count);
    }
    return map;
  }, [categoryCounts]);

  // Group categories by group
  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, { groupName: string; items: (CategoryWithGroup & { count: number })[] }>();
    for (const cat of categories) {
      const count = countMap.get(cat.id) ?? 0;
      if (!showAll && count === 0) continue;
      if (!grouped.has(cat.groupId)) {
        grouped.set(cat.groupId, { groupName: cat.groupName, items: [] });
      }
      grouped.get(cat.groupId)!.items.push({ ...cat, count });
    }
    return Array.from(grouped.values()).filter((g) => g.items.length > 0);
  }, [categories, countMap, showAll]);

  const populatedCount = useMemo(
    () => categories.filter((c) => (countMap.get(c.id) ?? 0) > 0).length,
    [categories, countMap],
  );

  const handleToggleExpand = useCallback(
    (categoryId: string) => {
      setExpandedCategoryId((prev) => {
        if (prev === categoryId) return null;
        // Load media for the expanded category if not already loaded
        if (!categoryMedia.has(categoryId)) {
          startLoadingTransition(async () => {
            const res = await fetch(`/api/categories/${categoryId}/media?personId=${personId}`);
            if (res.ok) {
              const data = await res.json() as CategoryMediaItem[];
              setCategoryMedia((prev) => {
                const next = new Map(prev);
                next.set(categoryId, data);
                return next;
              });
            }
          });
        }
        return categoryId;
      });
    },
    [personId, categoryMedia],
  );

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <p className="text-sm text-muted-foreground italic">
          No categories configured. Add categories in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {populatedCount} of {categories.length} categories have photos
        </p>
        <button
          type="button"
          onClick={() => setShowAll((p) => !p)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            showAll
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground hover:bg-muted/80",
          )}
        >
          {showAll ? "Show populated only" : "Show all categories"}
        </button>
      </div>

      {categoryGroups.length === 0 && !showAll && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <p className="text-sm text-muted-foreground italic">
            No categories have photos yet.
          </p>
        </div>
      )}

      {/* Category groups */}
      {categoryGroups.map((group) => (
        <div
          key={group.groupName}
          className="rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden"
        >
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Layers size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">{group.groupName}</h3>
          </div>

          <div className="divide-y divide-white/5">
            {group.items.map((cat) => {
              const isExpanded = expandedCategoryId === cat.id;
              const media = categoryMedia.get(cat.id);

              return (
                <div key={cat.id}>
                  <button
                    type="button"
                    onClick={() => cat.count > 0 ? handleToggleExpand(cat.id) : undefined}
                    disabled={cat.count === 0}
                    className={cn(
                      "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                      cat.count > 0
                        ? "hover:bg-muted/30 cursor-pointer"
                        : "opacity-50 cursor-default",
                    )}
                  >
                    {cat.count > 0 ? (
                      isExpanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="flex-1 text-sm font-medium">{cat.name}</span>
                    {cat.entityModel && (
                      <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {cat.entityModel}
                      </span>
                    )}
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      cat.count > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/40 text-muted-foreground",
                    )}>
                      {cat.count}
                    </span>
                  </button>

                  {/* Expanded gallery */}
                  {isExpanded && (
                    <div className="border-t border-white/5 bg-muted/10 px-5 py-4">
                      {!media ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                          Loading...
                        </div>
                      ) : media.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No photos</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                          {media.map((item) => {
                            const thumbUrl = item.urls.gallery_512 ?? item.urls.profile_256 ?? item.urls.original;
                            return (
                              <div
                                key={item.id}
                                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-muted/30"
                              >
                                {thumbUrl ? (
                                  <Image
                                    src={thumbUrl}
                                    alt={item.filename}
                                    width={item.originalWidth}
                                    height={item.originalHeight}
                                    unoptimized
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ImageIcon size={20} className="text-muted-foreground/40" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
