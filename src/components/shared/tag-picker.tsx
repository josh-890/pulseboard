"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TagDefinitionWithGroup } from "@/lib/services/tag-service";
import type { TagChipData } from "@/components/shared/tag-chips";
import { useRecentTags } from "@/hooks/use-recent-tags";

type TagPickerProps = {
  scope: "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string) => Promise<string | null>;
  placeholder?: string;
  compact?: boolean;
  /** Pre-resolved tag data for display (avoids extra fetch on mount) */
  selectedTags?: TagChipData[];
  /** Show recently used tags section (default: true) */
  showRecent?: boolean;
};

type GroupedResults = {
  groupId: string;
  groupName: string;
  groupColor: string;
  isExclusive: boolean;
  tags: TagDefinitionWithGroup[];
};

function groupResults(tags: TagDefinitionWithGroup[]): GroupedResults[] {
  const map = new Map<string, GroupedResults>();
  for (const tag of tags) {
    let group = map.get(tag.group.id);
    if (!group) {
      group = {
        groupId: tag.group.id,
        groupName: tag.group.name,
        groupColor: tag.group.color,
        isExclusive: tag.group.isExclusive,
        tags: [],
      };
      map.set(tag.group.id, group);
    }
    group.tags.push(tag);
  }
  return Array.from(map.values());
}

export function TagPicker({
  scope,
  selectedTagIds,
  onChange,
  onCreateTag,
  placeholder = "Search tags…",
  compact,
  selectedTags: initialSelectedTags,
  showRecent = true,
}: TagPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TagDefinitionWithGroup[]>([]);
  const [popularTags, setPopularTags] = useState<TagDefinitionWithGroup[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<TagChipData[]>(
    initialSelectedTags ?? [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const popularFetchedRef = useRef(false);

  const { recentTags, addRecent } = useRecentTags(scope);

  // Fetch tag info for selected IDs on mount if not provided
  useEffect(() => {
    if (initialSelectedTags || selectedTagIds.length === 0) return;
    const fetchSelected = async () => {
      try {
        const res = await fetch(`/api/tags/search?scope=${scope}`);
        if (!res.ok) return;
        const all: TagDefinitionWithGroup[] = await res.json();
        const selected = all.filter((t) => selectedTagIds.includes(t.id));
        setSelectedTags(
          selected.map((t) => ({
            id: t.id,
            name: t.name,
            group: t.group,
          })),
        );
      } catch {
        // Ignore fetch errors
      }
    };
    fetchSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch popular tags once
  const fetchPopular = useCallback(async () => {
    if (popularFetchedRef.current) return;
    popularFetchedRef.current = true;
    try {
      const res = await fetch(`/api/tags/search?scope=${scope}&popular=true`);
      if (res.ok) {
        const data: TagDefinitionWithGroup[] = await res.json();
        setPopularTags(data);
      }
    } catch {
      // Ignore
    }
  }, [scope]);

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const url = q.trim()
            ? `/api/tags/search?q=${encodeURIComponent(q)}&scope=${scope}`
            : `/api/tags/search?scope=${scope}`;
          const res = await fetch(url);
          if (res.ok) {
            const data: TagDefinitionWithGroup[] = await res.json();
            setResults(data);
            setHighlightIndex(-1);
          }
        } catch {
          // Ignore
        } finally {
          setIsLoading(false);
        }
      }, 200);
    },
    [scope],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setIsOpen(true);
      search(value);
    },
    [search],
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
    fetchPopular();
    search(query);
  }, [search, query, fetchPopular]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter out already-selected tags
  const availableResults = useMemo(
    () => results.filter((t) => !selectedTagIds.includes(t.id)),
    [results, selectedTagIds],
  );

  const isSearching = query.trim().length > 0;

  // Recently used tags (filtered to exclude already-selected, only when not searching)
  const filteredRecentTags = useMemo(() => {
    if (!showRecent || isSearching) return [];
    return recentTags.filter((t) => !selectedTagIds.includes(t.id));
  }, [showRecent, isSearching, recentTags, selectedTagIds]);

  // Popular/suggested tags (filtered, only when not searching)
  const filteredPopularTags = useMemo(() => {
    if (isSearching) return [];
    return popularTags
      .filter((t) => !selectedTagIds.includes(t.id))
      .filter((t) => !filteredRecentTags.some((r) => r.id === t.id))
      .slice(0, 10);
  }, [isSearching, popularTags, selectedTagIds, filteredRecentTags]);

  const grouped = useMemo(
    () => groupResults(availableResults),
    [availableResults],
  );

  // Flat list of available items for keyboard navigation
  const flatItems = useMemo(
    () => grouped.flatMap((g) => g.tags),
    [grouped],
  );

  const hasExactMatch = useMemo(
    () =>
      query.trim() &&
      results.some(
        (t) => t.name.toLowerCase() === query.trim().toLowerCase(),
      ),
    [query, results],
  );

  const selectTag = useCallback(
    (tag: TagDefinitionWithGroup | TagChipData) => {
      const tagGroup = tag.group;
      const isExclusive = "isExclusive" in tagGroup ? tagGroup.isExclusive : false;

      let newIds: string[];
      if (isExclusive) {
        // Remove other tags from the same exclusive group
        const otherGroupTagIds = selectedTags
          .filter((t) => t.group.name === tagGroup.name && t.id !== tag.id)
          .map((t) => t.id);
        const filteredIds = selectedTagIds.filter((id) => !otherGroupTagIds.includes(id));
        newIds = [...filteredIds, tag.id];
        // Update selectedTags removing the other group tags
        setSelectedTags((prev) => [
          ...prev.filter((t) => !otherGroupTagIds.includes(t.id)),
          { id: tag.id, name: tag.name, group: { name: tagGroup.name, color: tagGroup.color } },
        ]);
      } else {
        newIds = [...selectedTagIds, tag.id];
        setSelectedTags((prev) => [
          ...prev,
          { id: tag.id, name: tag.name, group: { name: tagGroup.name, color: tagGroup.color } },
        ]);
      }

      addRecent({ id: tag.id, name: tag.name, group: { name: tagGroup.name, color: tagGroup.color } });
      onChange(newIds);
      setQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [selectedTagIds, selectedTags, onChange, addRecent],
  );

  const removeTag = useCallback(
    (tagId: string) => {
      onChange(selectedTagIds.filter((id) => id !== tagId));
      setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
    },
    [selectedTagIds, onChange],
  );

  const handleCreateTag = useCallback(async () => {
    if (!onCreateTag || !query.trim()) return;
    const newId = await onCreateTag(query.trim());
    if (newId) {
      const newIds = [...selectedTagIds, newId];
      // Fetch the new tag info
      try {
        const res = await fetch(`/api/tags/search?q=${encodeURIComponent(query.trim())}&scope=${scope}`);
        if (res.ok) {
          const data: TagDefinitionWithGroup[] = await res.json();
          const newTag = data.find((t) => t.id === newId);
          if (newTag) {
            const chipData = { id: newTag.id, name: newTag.name, group: newTag.group };
            setSelectedTags((prev) => [...prev, chipData]);
            addRecent(chipData);
          }
        }
      } catch {
        // Ignore
      }
      onChange(newIds);
      setQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    }
  }, [onCreateTag, query, selectedTagIds, onChange, scope, addRecent]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < flatItems.length) {
          selectTag(flatItems[highlightIndex]);
        } else if (!hasExactMatch && onCreateTag && query.trim()) {
          handleCreateTag();
        }
      } else if (e.key === "Escape") {
        setQuery("");
        setIsOpen(false);
      } else if (
        e.key === "Backspace" &&
        !query &&
        selectedTagIds.length > 0
      ) {
        const lastId = selectedTagIds[selectedTagIds.length - 1];
        removeTag(lastId);
      }
    },
    [
      flatItems,
      highlightIndex,
      selectTag,
      hasExactMatch,
      onCreateTag,
      query,
      handleCreateTag,
      selectedTagIds,
      removeTag,
    ],
  );

  const renderTagItem = (tag: TagDefinitionWithGroup, index: number, groupColor: string) => (
    <button
      key={tag.id}
      type="button"
      onClick={() => selectTag(tag)}
      className={cn(
        "flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/30",
        highlightIndex === index && "bg-muted/30",
      )}
    >
      <span
        className="mt-1 inline-block shrink-0 rounded-full"
        style={{
          backgroundColor: groupColor,
          width: 6,
          height: 6,
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {tag.name}
          {tag.status === "pending" && (
            <span className="inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
              pending
            </span>
          )}
        </span>
        {tag.description && (
          <span className="block text-[10px] leading-tight text-muted-foreground/60">
            {tag.description}
          </span>
        )}
        {tag.aliases && tag.aliases.length > 0 && (
          <span className="block text-[10px] leading-tight text-muted-foreground/40">
            also: {tag.aliases.map((a) => a.name).join(", ")}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <div className="relative">
      {/* Selected chips + input */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-white/15 bg-background/50 px-2",
          compact ? "py-1" : "py-1.5",
        )}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: tag.group.color + "20",
              borderColor: tag.group.color + "40",
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{
                backgroundColor: tag.group.color,
                width: 6,
                height: 6,
              }}
            />
            {tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-foreground/10"
              aria-label={`Remove ${tag.name}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex flex-1 items-center gap-1">
          <Search size={12} className="shrink-0 text-muted-foreground/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length === 0 ? placeholder : ""}
            className="min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[200] mt-1 max-h-64 w-full overflow-auto rounded-md border border-white/15 bg-white shadow-lg dark:bg-slate-900"
        >
          {isLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Searching…
            </div>
          )}

          {/* Recently Used section (only when not searching) */}
          {!isLoading && !isSearching && filteredRecentTags.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Recently Used
              </div>
              {filteredRecentTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    // Need to fetch full tag data for exclusive group logic
                    const fullTag = popularTags.find((p) => p.id === tag.id) ??
                      results.find((r) => r.id === tag.id);
                    if (fullTag) {
                      selectTag(fullTag);
                    } else {
                      // Fallback: use chip data
                      selectTag({
                        ...tag,
                        slug: "",
                        status: "active",
                        description: null,
                        scope: [],
                        sortOrder: 0,
                        group: { ...tag.group, id: "", slug: "", isExclusive: false },
                      } as TagDefinitionWithGroup);
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/30"
                >
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{ backgroundColor: tag.group.color, width: 6, height: 6 }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {/* Suggested/Popular section (only when not searching) */}
          {!isLoading && !isSearching && filteredPopularTags.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Suggested
              </div>
              {filteredPopularTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => selectTag(tag)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/30"
                >
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{ backgroundColor: tag.group.color, width: 6, height: 6 }}
                  />
                  {tag.name}
                  {tag.description && (
                    <span className="text-[10px] text-muted-foreground/50">
                      — {tag.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {!isLoading && isSearching && grouped.length === 0 && !onCreateTag && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No matching tags found.
            </div>
          )}

          {!isLoading && !isSearching && grouped.length === 0 && filteredRecentTags.length === 0 && filteredPopularTags.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No tags available for this scope.
            </div>
          )}

          {/* Grouped tag results (shown when searching, or as full list when no recent/popular) */}
          {isSearching && grouped.map((group) => {
            let runningIndex = 0;
            for (const g of grouped) {
              if (g.groupId === group.groupId) break;
              runningIndex += g.tags.length;
            }
            return (
              <div key={group.groupId}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <span
                    className="inline-block rounded-full"
                    style={{
                      backgroundColor: group.groupColor,
                      width: 8,
                      height: 8,
                    }}
                  />
                  {group.groupName}
                  {group.isExclusive && (
                    <span className="text-[9px] font-normal normal-case text-muted-foreground/40">
                      (exclusive)
                    </span>
                  )}
                </div>
                {group.tags.map((tag, i) =>
                  renderTagItem(tag, runningIndex + i, group.groupColor),
                )}
              </div>
            );
          })}

          {/* All tags grouped (when not searching and no recent/popular showing everything) */}
          {!isSearching && (filteredRecentTags.length > 0 || filteredPopularTags.length > 0) && grouped.length > 0 && (
            <>
              <div className="border-t border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                All Tags
              </div>
              {grouped.map((group) => {
                let runningIndex = 0;
                for (const g of grouped) {
                  if (g.groupId === group.groupId) break;
                  runningIndex += g.tags.length;
                }
                return (
                  <div key={group.groupId}>
                    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      <span
                        className="inline-block rounded-full"
                        style={{
                          backgroundColor: group.groupColor,
                          width: 8,
                          height: 8,
                        }}
                      />
                      {group.groupName}
                      {group.isExclusive && (
                        <span className="text-[9px] font-normal normal-case text-muted-foreground/40">
                          (exclusive)
                        </span>
                      )}
                    </div>
                    {group.tags.map((tag, i) =>
                      renderTagItem(tag, runningIndex + i, group.groupColor),
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* When not searching and no recent/popular, show grouped directly */}
          {!isSearching && filteredRecentTags.length === 0 && filteredPopularTags.length === 0 && grouped.map((group) => {
            let runningIndex = 0;
            for (const g of grouped) {
              if (g.groupId === group.groupId) break;
              runningIndex += g.tags.length;
            }
            return (
              <div key={group.groupId}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <span
                    className="inline-block rounded-full"
                    style={{
                      backgroundColor: group.groupColor,
                      width: 8,
                      height: 8,
                    }}
                  />
                  {group.groupName}
                  {group.isExclusive && (
                    <span className="text-[9px] font-normal normal-case text-muted-foreground/40">
                      (exclusive)
                    </span>
                  )}
                </div>
                {group.tags.map((tag, i) =>
                  renderTagItem(tag, runningIndex + i, group.groupColor),
                )}
              </div>
            );
          })}

          {/* Create tag option */}
          {!isLoading &&
            onCreateTag &&
            query.trim() &&
            !hasExactMatch && (
              <button
                type="button"
                onClick={handleCreateTag}
                className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-xs text-primary transition-colors hover:bg-muted/30"
              >
                <Plus size={12} />
                Create &ldquo;{query.trim()}&rdquo;
              </button>
            )}
        </div>
      )}
    </div>
  );
}
