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

type TagPickerProps = {
  scope: "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string) => Promise<string | null>;
  placeholder?: string;
  compact?: boolean;
  /** Pre-resolved tag data for display (avoids extra fetch on mount) */
  selectedTags?: TagChipData[];
};

type GroupedResults = {
  groupId: string;
  groupName: string;
  groupColor: string;
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
}: TagPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TagDefinitionWithGroup[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<TagChipData[]>(
    initialSelectedTags ?? [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
    search(query);
  }, [search, query]);

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
    (tag: TagDefinitionWithGroup) => {
      const newIds = [...selectedTagIds, tag.id];
      setSelectedTags((prev) => [
        ...prev,
        { id: tag.id, name: tag.name, group: tag.group },
      ]);
      onChange(newIds);
      setQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [selectedTagIds, onChange],
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
            setSelectedTags((prev) => [
              ...prev,
              { id: newTag.id, name: newTag.name, group: newTag.group },
            ]);
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
  }, [onCreateTag, query, selectedTagIds, onChange, scope]);

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
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-white/15 bg-white shadow-lg dark:bg-slate-900"
        >
          {isLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Searching…
            </div>
          )}

          {!isLoading && grouped.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No tags available for this scope.
            </div>
          )}

          {!isLoading && grouped.length === 0 && query.trim() && !onCreateTag && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No matching tags found.
            </div>
          )}

          {grouped.map((group) => (
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
              </div>
              {group.tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => selectTag(tag)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/30",
                      highlightIndex === flatItems.indexOf(tag) && "bg-muted/30",
                    )}
                  >
                    <span
                      className="inline-block shrink-0 rounded-full"
                      style={{
                        backgroundColor: group.groupColor,
                        width: 6,
                        height: 6,
                      }}
                    />
                    {tag.name}
                  </button>
              ))}
            </div>
          ))}

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
