"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { Check, ListTodo, Lock, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { createInlineTagAction } from "@/lib/actions/tag-actions";
import { TagNameClashHint } from "./tag-name-clash-hint";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import type { PaletteGroup, PaletteTag } from "@/lib/services/tag-service";
import { cn } from "@/lib/utils";

type PaletteData = { groups: PaletteGroup[]; tags: PaletteTag[] };

// One fetch per entity type per page life; dropped after an inline create
const paletteCache = new Map<TaggableEntity, Promise<PaletteData>>();

function loadPaletteData(entityType: TaggableEntity): Promise<PaletteData> {
  let p = paletteCache.get(entityType);
  if (!p) {
    p = fetch(`/api/tags/palette?entityType=${entityType}`).then((r) => {
      if (!r.ok) throw new Error(`palette ${r.status}`);
      return r.json() as Promise<PaletteData>;
    });
    p.catch(() => paletteCache.delete(entityType));
    paletteCache.set(entityType, p);
  }
  return p;
}

const LAST_GROUP_KEY = (entityType: TaggableEntity) => `pulseboard:tag-create-group:${entityType}`;

function readLastGroup(entityType: TaggableEntity): string | null {
  try {
    return localStorage.getItem(LAST_GROUP_KEY(entityType));
  } catch {
    return null;
  }
}

function writeLastGroup(entityType: TaggableEntity, groupId: string) {
  try {
    localStorage.setItem(LAST_GROUP_KEY(entityType), groupId);
  } catch {
    // Per-viewer convenience only
  }
}

const ENTITY_NOUN: Record<TaggableEntity, string> = {
  PERSON: "person",
  SESSION: "session",
  SET: "set",
  MEDIA_ITEM: "image",
  PROJECT: "project",
  ARCHIVE_FOLDER: "folder",
};

const ENTITY_PLURAL: Record<TaggableEntity, string> = {
  PERSON: "people",
  SESSION: "sessions",
  SET: "sets",
  MEDIA_ITEM: "images",
  PROJECT: "projects",
  ARCHIVE_FOLDER: "folders",
};

export type TagPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: TaggableEntity;
  /** Direct tags of the single item being tagged */
  selectedTagIds?: string[];
  /** Toggle one tag; the palette stays open for the next one */
  onToggle?: (tag: PaletteTag, on: boolean) => void;
  /**
   * Bulk mode: how many of the `selectionSize` selected items carry each tag.
   * Rows show ✓ (all) / – (some) / blank (none); choosing a row adds the tag
   * to all, or removes it when every item already has it.
   */
  selectionCounts?: Record<string, number>;
  selectionSize?: number;
  /** Pick mode: choosing a tag hands it over and closes (arming, slot setup) */
  onPick?: (tag: PaletteTag) => void;
  /** Overrides the dialog title */
  title?: string;
  /** Search text to start with (read on mount — mount the palette per use) */
  initialQuery?: string;
};

type RowState = "all" | "some" | "none";

// ADR-0033 tag palette (cmdk), the tagging twin of the collection quick-add
// palette (ADR-0019). Type to fuzzy-find by name, alias or group; Enter
// toggles. A name nobody has yet offers "Create … in <group>" — Tab cycles the
// group, and the last group used is remembered per entity type. The fuzzy
// matches above the Create row are the "did you mean".
export function TagPalette({
  open,
  onOpenChange,
  entityType,
  selectedTagIds = [],
  onToggle,
  selectionCounts,
  selectionSize,
  onPick,
  title,
  initialQuery,
}: TagPaletteProps) {
  const isBulk = selectionCounts !== undefined && selectionSize !== undefined;
  const rowState = (tagId: string): RowState => {
    if (onPick) return "none";
    if (isBulk) {
      const n = selectionCounts[tagId] ?? 0;
      return n === 0 ? "none" : n >= selectionSize ? "all" : "some";
    }
    return selectedTagIds.includes(tagId) ? "all" : "none";
  };
  const [data, setData] = useState<PaletteData | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [createGroupId, setCreateGroupId] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadPaletteData(entityType)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => toast.error("Could not load tags"));
    return () => {
      alive = false;
    };
  }, [open, entityType]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setQuery("");
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const tagsByGroup = useMemo(() => {
    const m = new Map<string, PaletteTag[]>();
    for (const t of data?.tags ?? []) {
      const list = m.get(t.group.id) ?? [];
      list.push(t);
      m.set(t.group.id, list);
    }
    return m;
  }, [data]);
  const nameById = useMemo(() => new Map((data?.tags ?? []).map((t) => [t.id, t.name])), [data]);

  const trimmed = query.trim();
  const norm = trimmed.toLowerCase();
  const exactMatch = useMemo(
    () =>
      !!norm &&
      (data?.tags ?? []).some(
        (t) => t.name.toLowerCase() === norm || (t.aliases ?? []).some((a) => a.name.toLowerCase() === norm),
      ),
    [data, norm],
  );
  const showCreate = !!trimmed && !exactMatch && groups.length > 0;

  const effectiveCreateGroup = useMemo(() => {
    const preferred = createGroupId ?? readLastGroup(entityType);
    return groups.find((g) => g.id === preferred) ?? groups[0] ?? null;
  }, [createGroupId, entityType, groups]);

  const cycleCreateGroup = (dir: 1 | -1) => {
    if (groups.length === 0 || !effectiveCreateGroup) return;
    const i = groups.findIndex((g) => g.id === effectiveCreateGroup.id);
    setCreateGroupId(groups[(i + dir + groups.length) % groups.length].id);
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && showCreate) {
      e.preventDefault();
      cycleCreateGroup(e.shiftKey ? -1 : 1);
    }
  };

  const choose = (tag: PaletteTag) => {
    if (onPick) {
      onPick(tag);
      handleOpenChange(false);
      return;
    }
    // Some or none → add to all; all → remove from all
    onToggle?.(tag, rowState(tag.id) !== "all");
    setQuery("");
  };

  const create = () => {
    const group = effectiveCreateGroup;
    if (!group || !trimmed) return;
    const name = trimmed;
    startCreate(async () => {
      const res = await createInlineTagAction(group.id, name);
      if (!res.success || !res.id) {
        toast.error(res.error ?? "Failed to create tag");
        return;
      }
      writeLastGroup(entityType, group.id);
      const created: PaletteTag = {
        id: res.id,
        name,
        slug: "",
        description: null,
        parentId: null,
        typicalLevel: null,
        sortOrder: Number.MAX_SAFE_INTEGER,
        group: {
          id: group.id,
          name: group.name,
          slug: "",
          color: group.color,
          isExclusive: group.isExclusive,
          domain: "ANY",
          typicalLevel: group.typicalLevel,
          kind: group.kind,
        },
        aliases: [],
        usageCount: 0,
      };
      // Every palette (any entity type) re-reads the catalogue next time
      paletteCache.clear();
      setData((d) => (d ? { ...d, tags: [...d.tags, created] } : d));
      if (onPick) {
        onPick(created);
        handleOpenChange(false);
      } else {
        onToggle?.(created, true);
        setQuery("");
      }
      toast.success(`Created “${name}” in ${group.name}`);
    });
  };

  const dialogTitle =
    title ??
    (isBulk
      ? `Tag ${selectionSize} ${selectionSize === 1 ? ENTITY_NOUN[entityType] : ENTITY_PLURAL[entityType]}`
      : `Tag this ${ENTITY_NOUN[entityType]}`);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title={dialogTitle}>
      <CommandInput
        placeholder={`${dialogTitle} — type to find or create…`}
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleInputKeyDown}
        aria-label="Search or create a tag"
      />
      <CommandList className="max-h-[420px]">
        {!data ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading tags…</div>
        ) : (
          !showCreate && <CommandEmpty>No matching tags.</CommandEmpty>
        )}
        {groups.map((g) => {
          const tags = tagsByGroup.get(g.id) ?? [];
          if (tags.length === 0) return null;
          return (
            <CommandGroup
              key={g.id}
              heading={
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                  {g.isExclusive && <Lock size={10} aria-label="one per item" />}
                  {g.kind === "WORKFLOW" && <ListTodo size={11} aria-label="workflow" />}
                </span>
              }
            >
              {tags.map((t) => {
                const state = rowState(t.id);
                const parentName = t.parentId ? nameById.get(t.parentId) : undefined;
                return (
                  <CommandItem
                    key={t.id}
                    value={`${g.name}/${t.name}`}
                    keywords={[t.name, g.name, ...(t.aliases ?? []).map((a) => a.name)]}
                    onSelect={() => choose(t)}
                    className="gap-2 py-2"
                    aria-checked={onPick ? undefined : state === "all" ? true : state === "some" ? "mixed" : false}
                  >
                    {state === "some" ? (
                      <Minus className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Check className={cn("size-4 shrink-0", state === "all" ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {t.name}
                      {parentName && <span className="ml-1.5 text-xs text-muted-foreground">⊂ {parentName}</span>}
                      {t.aliases && t.aliases.length > 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground/60">
                          also {t.aliases.map((a) => a.name).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground/70">
                      {isBulk && state !== "none"
                        ? `${selectionCounts[t.id] ?? 0}/${selectionSize}`
                        : t.usageCount || ""}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
        {showCreate && effectiveCreateGroup && (
          // forceMount on the group too: cmdk hides a group whose items all failed the filter
          <CommandGroup heading="Create" forceMount>
            <CommandItem
              value={`__create__ ${trimmed}`}
              forceMount
              onSelect={create}
              disabled={isCreating}
              className="gap-2 py-2"
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                Create “<span className="font-medium">{trimmed}</span>” in{" "}
                <span className="inline-flex items-center gap-1 font-medium">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: effectiveCreateGroup.color }}
                  />
                  {effectiveCreateGroup.name}
                </span>
              </span>
              {groups.length > 1 && (
                <kbd className="rounded border border-white/15 px-1 text-[10px] text-muted-foreground">Tab</kbd>
              )}
            </CommandItem>
            <TagNameClashHint
              name={trimmed}
              groupName={effectiveCreateGroup.name}
              onUseSuggestion={setQuery}
              className="mx-2 mb-1"
            />
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
