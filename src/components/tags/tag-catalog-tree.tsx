"use client";

import { useMemo, useState, useTransition, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, FolderInput, GitMerge, GripVertical, ListTodo, Lock, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagMergeDialog } from "@/components/settings/tag-merge-dialog";
import { createTagDefinitionAction, mergeTagDefinitionsAction, updateTagDefinitionAction } from "@/lib/actions/tag-actions";
import type { TagCounts, TagTreeGroup, TagTreeTag } from "@/lib/services/tag-browse-service";
import type { NearDuplicatePair } from "@/lib/services/tag-service";
import { toTagName } from "@/lib/tag-names";
import { cn } from "@/lib/utils";
import { TagDeleteDialog } from "./tag-delete-dialog";
import { TagMoveDialog } from "./tag-move-dialog";
import { TagNameClashHint } from "./tag-name-clash-hint";
import { TagParentDialog } from "./tag-parent-dialog";
import { TagRowMenu } from "./tag-row-menu";

const COUNT_LABELS: { key: keyof TagCounts; short: string; long: string }[] = [
  { key: "person", short: "P", long: "people" },
  { key: "session", short: "Se", long: "sessions" },
  { key: "set", short: "S", long: "sets" },
  { key: "media", short: "I", long: "images" },
  { key: "project", short: "Pr", long: "projects" },
  { key: "archive", short: "A", long: "archive folders (not yet a set)" },
];

const total = (c: TagCounts) => c.person + c.session + c.set + c.media + c.project + c.archive;

/** Tags of a group in tree order (parents before their sub-tags) with depth */
function treeOrder(tags: TagTreeTag[]): { tag: TagTreeTag; depth: number }[] {
  const children = new Map<string | null, TagTreeTag[]>();
  const ids = new Set(tags.map((t) => t.id));
  for (const t of tags) {
    const key = t.parentId && ids.has(t.parentId) ? t.parentId : null;
    children.set(key, [...(children.get(key) ?? []), t]);
  }
  const out: { tag: TagTreeTag; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of children.get(parent) ?? []) {
      out.push({ tag: t, depth });
      if (depth < 8) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

type Filter = "all" | "unused" | "ambiguous" | "similar";

export type TagCatalogTreeProps = {
  groups: TagTreeGroup[];
  /** Pairs of tags with very similar names — the "similar" clean-up filter */
  nearDuplicates?: NearDuplicatePair[];
};

// The tag catalogue — where tags are managed (2026-10-10; Settings keeps groups).
// Every group with its tag tree and usage per kind of item. Each row: a tick for
// several-at-once, a ⋯ menu (also right-click; F2 rename, Del delete on a focused
// row). Drag a tag onto another for sub-tag/merge, onto a group header to move it.
export function TagCatalogTree({ groups, nearDuplicates = [] }: TagCatalogTreeProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [creating, setCreating] = useState<{ groupId: string; value: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moveDlg, setMoveDlg] = useState<{ tags: TagTreeTag[]; groupId: string | null } | null>(null);
  const [parentDlg, setParentDlg] = useState<TagTreeTag[] | null>(null);
  const [mergeDlg, setMergeDlg] = useState<{ sources: TagTreeTag[]; targetId: string | null; key: number } | null>(null);
  const [deleteDlg, setDeleteDlg] = useState<TagTreeTag[] | null>(null);
  const [drop, setDrop] = useState<{ source: TagTreeTag; target: TagTreeTag } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const norm = search.trim().toLowerCase();

  const allTags = useMemo(() => groups.flatMap((g) => g.tags), [groups]);
  const byId = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  // Names carried by tags in more than one group (naming guide: names should be unique)
  const sharedName = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of groups) for (const t of g.tags) m.set(t.name.toLowerCase(), [...(m.get(t.name.toLowerCase()) ?? []), g.name]);
    return m;
  }, [groups]);
  const similarTo = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of nearDuplicates) {
      m.set(p.tagA.id, [...(m.get(p.tagA.id) ?? []), p.tagB.name]);
      m.set(p.tagB.id, [...(m.get(p.tagB.id) ?? []), p.tagA.name]);
    }
    return m;
  }, [nearDuplicates]);

  const isAmbiguous = (t: TagTreeTag) => (sharedName.get(t.name.toLowerCase()) ?? []).length > 1;
  const passesFilter = (t: TagTreeTag) =>
    filter === "all" ||
    (filter === "unused" && total(t.counts) === 0) ||
    (filter === "ambiguous" && isAmbiguous(t)) ||
    (filter === "similar" && similarTo.has(t.id));
  const filterCount = (f: Filter) => allTags.filter((t) => f === "all" || (f === "unused" ? total(t.counts) === 0 : f === "ambiguous" ? isAmbiguous(t) : similarTo.has(t.id))).length;

  const visible = groups.map((g) => ({
    group: g,
    rows: treeOrder(g.tags).filter(
      ({ tag }) =>
        passesFilter(tag) &&
        (!norm ||
          tag.name.toLowerCase().includes(norm) ||
          g.name.toLowerCase().includes(norm) ||
          (tag.aliases ?? []).some((a) => a.name.toLowerCase().includes(norm))),
    ),
  }));
  const visibleIds = visible.flatMap((v) => v.rows.map((r) => r.tag.id));
  const selectedTags = [...selected].map((id) => byId.get(id)).filter((t): t is TagTreeTag => !!t);

  const refresh = () => router.refresh();
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.success) toast.error(res.error ?? "Failed");
      else if (ok) toast.success(ok);
      refresh();
    });

  const rename = (tag: TagTreeTag, value: string) => {
    setRenaming(null);
    const name = toTagName(value);
    if (!name || name === tag.name) return;
    run(() => updateTagDefinitionAction(tag.id, { name }), `Renamed to “${name}”`);
  };

  const create = (groupId: string, value: string) => {
    const name = toTagName(value);
    if (!name) {
      setCreating(null);
      return;
    }
    setCreating({ groupId, value: "" });
    run(() => createTagDefinitionAction({ groupId, name }), `Created “${name}”`);
  };

  const toggle = (id: string, e?: MouseEvent | KeyboardEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && anchor && visibleIds.includes(anchor)) {
        const [a, b] = [visibleIds.indexOf(anchor), visibleIds.indexOf(id)].sort((x, y) => x - y);
        for (const v of visibleIds.slice(a, b + 1)) next.add(v);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };
  const clearSelection = () => setSelected(new Set());

  const onRowKey = (e: KeyboardEvent<HTMLLIElement>, tag: TagTreeTag) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "F2") {
      e.preventDefault();
      setRenaming({ id: tag.id, value: tag.name });
    } else if (e.key === "Delete") {
      e.preventDefault();
      setDeleteDlg(selected.has(tag.id) && selectedTags.length > 1 ? selectedTags : [tag]);
    } else if (e.key === " ") {
      e.preventDefault();
      toggle(tag.id, e);
    } else if (e.key === "Enter") {
      router.push(`/tags/${tag.id}`);
    }
  };

  const onDropOnTag = (e: DragEvent, target: TagTreeTag) => {
    e.preventDefault();
    e.stopPropagation();
    const source = byId.get(e.dataTransfer.getData("text/tag-id"));
    setDragId(null);
    setDropGroup(null);
    if (!source || source.id === target.id) return;
    setDrop({ source, target });
  };
  const onDropOnGroup = (e: DragEvent, g: TagTreeGroup) => {
    e.preventDefault();
    const source = byId.get(e.dataTransfer.getData("text/tag-id"));
    setDragId(null);
    setDropGroup(null);
    if (!source || source.group.id === g.id) return;
    const tags = selected.has(source.id) && selectedTags.length > 1 ? selectedTags : [source];
    setMoveDlg({ tags, groupId: g.id });
  };

  const moveGroups = groups.map((g) => ({ id: g.id, name: g.name, color: g.color, domain: g.domain, isExclusive: g.isExclusive }));
  const parentCandidates = allTags.map((t) => ({ id: t.id, name: t.name, groupName: t.group.name, color: t.group.color }));

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-white/15 bg-muted/30 px-2.5">
          <Search size={14} className="text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a tag…"
            aria-label="Find a tag"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Clean-up filters">
          {(
            [
              ["all", "All"],
              ["unused", "Unused"],
              ["ambiguous", "Ambiguous"],
              ["similar", "Similar names"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              title={
                f === "unused"
                  ? "On nothing at all — safe to delete, or not yet used"
                  : f === "ambiguous"
                    ? "Same name in several groups"
                    : f === "similar"
                      ? "Names so close they may be the same tag — merge?"
                      : undefined
              }
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                filter === f ? "border-primary/50 bg-primary/15 text-primary" : "border-white/15 text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {f !== "all" && <span className="ml-1 tabular-nums opacity-70">{filterCount(f)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map(({ group: g, rows }) => {
          if ((norm || filter !== "all") && rows.length === 0) return null;
          return (
            <section
              key={g.id}
              className={cn(
                "rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm transition-colors duration-150",
                dropGroup === g.id ? "border-primary/60 bg-primary/5" : "border-white/15",
              )}
              aria-label={g.name}
            >
              <header
                className="mb-2 flex items-center gap-2"
                onDragOver={(e) => {
                  if (dragId && byId.get(dragId)?.group.id !== g.id) {
                    e.preventDefault();
                    setDropGroup(g.id);
                  }
                }}
                onDragLeave={() => setDropGroup((d) => (d === g.id ? null : d))}
                onDrop={(e) => onDropOnGroup(e, g)}
              >
                <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                <h2 className="text-sm font-semibold">{g.name}</h2>
                {g.isExclusive && <Lock size={11} className="text-muted-foreground" aria-label="one per item" />}
                {g.kind === "WORKFLOW" && <ListTodo size={12} className="text-amber-400" aria-label="workflow" />}
                {dropGroup === g.id && <span className="text-xs text-primary">Drop to move here</span>}
                <button
                  type="button"
                  onClick={() => setCreating({ groupId: g.id, value: "" })}
                  className="rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`New tag in ${g.name}`}
                  title={`New tag in ${g.name}`}
                >
                  <Plus size={13} />
                </button>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.domain.toLowerCase()}
                  {g.typicalLevel ? ` · ${g.typicalLevel === "MEDIA_ITEM" ? "image" : g.typicalLevel.toLowerCase()}` : ""}
                </span>
              </header>
              {creating?.groupId === g.id && (
                <div className="mb-1.5 space-y-1">
                  <input
                    value={creating.value}
                    onChange={(e) => setCreating({ groupId: g.id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") create(g.id, creating.value);
                      if (e.key === "Escape") setCreating(null);
                    }}
                    onBlur={() => !creating.value.trim() && setCreating(null)}
                    placeholder={`new tag in ${g.name} — Enter to add, Esc to stop`}
                    aria-label={`New tag in ${g.name}`}
                    className="h-7 w-full rounded border border-white/20 bg-background/60 px-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                  <TagNameClashHint
                    name={creating.value}
                    groupName={g.name}
                    onUseSuggestion={(v) => setCreating({ groupId: g.id, value: v })}
                  />
                </div>
              )}
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet — add one with +, or create them while tagging (T).</p>
              ) : (
                <ul className="space-y-0.5">
                  {rows.map(({ tag, depth }) => (
                    <li
                      key={tag.id}
                      tabIndex={0}
                      draggable
                      onKeyDown={(e) => onRowKey(e, tag)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenuFor(tag.id);
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/tag-id", tag.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(tag.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropGroup(null);
                      }}
                      onDragOver={(e) => {
                        if (dragId && dragId !== tag.id) e.preventDefault();
                      }}
                      onDrop={(e) => onDropOnTag(e, tag)}
                      className={cn(
                        "flex flex-wrap items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        selected.has(tag.id) && "bg-primary/10",
                        dragId === tag.id && "opacity-40",
                      )}
                      style={{ paddingLeft: `${0.25 + depth * 1.1}rem` }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(tag.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          toggle(tag.id, e);
                        }}
                        onChange={() => undefined}
                        aria-label={`Select ${tag.name}`}
                        className="size-3.5 shrink-0 cursor-pointer accent-primary"
                      />
                      <GripVertical size={12} className="shrink-0 cursor-grab text-muted-foreground/40" aria-hidden="true" />
                      {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                      {renaming?.id === tag.id ? (
                        <input
                          value={renaming.value}
                          onChange={(e) => setRenaming({ id: tag.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") rename(tag, renaming.value);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          onBlur={() => rename(tag, renaming.value)}
                          className="h-6 min-w-0 flex-1 rounded border border-white/20 bg-background/60 px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          aria-label={`Rename ${tag.name}`}
                          autoFocus
                        />
                      ) : (
                        <Link href={`/tags/${tag.id}`} className="min-w-0 truncate hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                          {tag.name}
                        </Link>
                      )}
                      {isAmbiguous(tag) && (
                        <span
                          title={`“${tag.name}” is a tag in ${(sharedName.get(tag.name.toLowerCase()) ?? []).join(" and ")} — ambiguous on its own (use group:name, #group=name). Renaming one makes it unique.`}
                          className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                        >
                          ambiguous
                        </span>
                      )}
                      {filter === "similar" && similarTo.has(tag.id) && (
                        <span className="shrink-0 text-[10px] text-amber-700 dark:text-amber-300">≈ {(similarTo.get(tag.id) ?? []).join(", ")}</span>
                      )}
                      {(tag.aliases ?? []).length > 0 && (
                        <span className="hidden truncate text-[10px] text-muted-foreground/60 sm:inline">
                          also {(tag.aliases ?? []).map((a) => a.name).join(", ")}
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {COUNT_LABELS.filter((c) => tag.counts[c.key] > 0).map((c) => (
                          <span
                            key={c.key}
                            className="rounded bg-muted/50 px-1 text-[10px] tabular-nums text-muted-foreground"
                            title={`${tag.counts[c.key]} ${c.long} (own)`}
                          >
                            {c.short} {tag.counts[c.key]}
                          </span>
                        ))}
                        {total(tag.counts) === 0 && <span className="text-[10px] italic text-muted-foreground/60">unused</span>}
                      </span>
                      <TagRowMenu
                        tagId={tag.id}
                        tagName={tag.name}
                        open={menuFor === tag.id}
                        onOpenChange={(o) => setMenuFor(o ? tag.id : null)}
                        onRename={() => setRenaming({ id: tag.id, value: tag.name })}
                        onMove={() => setMoveDlg({ tags: [tag], groupId: null })}
                        onParent={() => setParentDlg([tag])}
                        onMerge={() => setMergeDlg({ sources: [tag], targetId: null, key: Date.now() })}
                        onDelete={() => setDeleteDlg([tag])}
                      />
                      {renaming?.id === tag.id && (
                        <TagNameClashHint
                          name={renaming.value}
                          groupName={g.name}
                          excludeId={tag.id}
                          onUseSuggestion={(v) => setRenaming({ id: tag.id, value: v })}
                          className="basis-full"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* Several at once */}
      {selectedTags.length > 0 && (
        <div
          role="toolbar"
          aria-label="Selected tags"
          className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-background/95 px-3 py-2 shadow-lg backdrop-blur-md"
        >
          <span className="text-sm font-medium tabular-nums">{selectedTags.length} selected</span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMoveDlg({ tags: selectedTags, groupId: null })}>
            <FolderInput size={13} /> Move to group…
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setParentDlg(selectedTags)}>
            <CornerDownRight size={13} /> Sub-tags of…
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMergeDlg({ sources: selectedTags, targetId: null, key: Date.now() })}>
            <GitMerge size={13} /> Merge into…
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setDeleteDlg(selectedTags)}>
            <Trash2 size={13} /> Delete…
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={clearSelection} aria-label="Clear selection">
            <X size={13} />
          </Button>
        </div>
      )}

      {moveDlg && (
        <TagMoveDialog
          tags={moveDlg.tags.map((t) => ({ id: t.id, name: t.name, groupId: t.group.id }))}
          groups={moveGroups}
          initialGroupId={moveDlg.groupId}
          open
          onOpenChange={(o) => !o && setMoveDlg(null)}
          onMoved={() => {
            clearSelection();
            refresh();
          }}
          onMergeInstead={(sourceId, targetId) => {
            const source = byId.get(sourceId);
            if (source) setMergeDlg({ sources: [source], targetId, key: Date.now() });
          }}
        />
      )}
      {parentDlg && (
        <TagParentDialog
          tags={parentDlg}
          candidates={parentCandidates}
          open
          onOpenChange={(o) => !o && setParentDlg(null)}
          onDone={() => {
            clearSelection();
            refresh();
          }}
        />
      )}
      {mergeDlg && (
        <TagMergeDialog
          key={mergeDlg.key}
          open
          onClose={() => setMergeDlg(null)}
          sourceTags={mergeDlg.sources}
          allTags={allTags}
          initialTargetId={mergeDlg.targetId}
        />
      )}
      {deleteDlg && (
        <TagDeleteDialog
          tags={deleteDlg}
          open
          onOpenChange={(o) => !o && setDeleteDlg(null)}
          onDeleted={() => {
            clearSelection();
            refresh();
          }}
        />
      )}

      <Dialog open={drop !== null} onOpenChange={(o) => !o && setDrop(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              “{drop?.source.name}” onto “{drop?.target.name}”
            </DialogTitle>
            <DialogDescription>Make it a sub-tag, or merge the two into one?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => {
                if (drop) run(() => updateTagDefinitionAction(drop.source.id, { parentId: drop.target.id }), "Moved under");
                setDrop(null);
              }}
            >
              <CornerDownRight size={14} /> Make “{drop?.source.name}” a sub-tag of “{drop?.target.name}”
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => {
                if (drop) {
                  const { source, target } = drop;
                  run(() => mergeTagDefinitionsAction([source.id], target.id), `Merged “${source.name}” into “${target.name}”`);
                }
                setDrop(null);
              }}
            >
              <GitMerge size={14} /> Merge “{drop?.source.name}” into “{drop?.target.name}”
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
