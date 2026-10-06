"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, GitMerge, GripVertical, ListTodo, Lock, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TagMergeDialog } from "@/components/settings/tag-merge-dialog";
import { deleteTagDefinitionAction, mergeTagDefinitionsAction, updateTagDefinitionAction } from "@/lib/actions/tag-actions";
import type { TagCounts, TagTreeGroup, TagTreeTag } from "@/lib/services/tag-browse-service";
import { cn } from "@/lib/utils";
import { TagNameClashHint } from "./tag-name-clash-hint";
import { toTagName } from "@/lib/tag-names";

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

export type TagCatalogTreeProps = { groups: TagTreeGroup[] };

// The /tags catalogue (ADR-0033, S7): every group with its tag tree and how
// often each tag is used per kind of item. Rename in place, move a tag under
// another (or drag it onto one), merge, delete. Click a name for its page.
export function TagCatalogTree({ groups }: TagCatalogTreeProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [mergeSource, setMergeSource] = useState<TagTreeTag | null>(null);
  const [mergeKey, setMergeKey] = useState(0);
  const [drop, setDrop] = useState<{ source: TagTreeTag; target: TagTreeTag } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const norm = search.trim().toLowerCase();

  const allTags = useMemo(() => groups.flatMap((g) => g.tags), [groups]);
  // Names carried by tags in more than one group (naming guide: names should be unique)
  const sharedName = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of groups) for (const t of g.tags) m.set(t.name.toLowerCase(), [...(m.get(t.name.toLowerCase()) ?? []), g.name]);
    return m;
  }, [groups]);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.success) toast.error(res.error ?? "Failed");
      else if (ok) toast.success(ok);
      router.refresh();
    });

  const rename = (tag: TagTreeTag, value: string) => {
    setRenaming(null);
    const name = toTagName(value);
    if (!name || name === tag.name) return;
    run(() => updateTagDefinitionAction(tag.id, { name }), `Renamed to “${name}”`);
  };

  const moveUnder = (tag: TagTreeTag, parentId: string | null) =>
    run(() => updateTagDefinitionAction(tag.id, { parentId }), parentId ? "Moved" : "Moved to the top level");

  const remove = (tag: TagTreeTag) => {
    const n = total(tag.counts);
    if (!window.confirm(`Delete “${tag.name}”?${n > 0 ? ` It is on ${n} item${n === 1 ? "" : "s"}; they lose it.` : ""} Its sub-tags move up a level.`)) return;
    run(() => deleteTagDefinitionAction(tag.id), `Deleted “${tag.name}”`);
  };

  const onDrop = (e: DragEvent, target: TagTreeTag) => {
    e.preventDefault();
    const source = allTags.find((t) => t.id === e.dataTransfer.getData("text/tag-id"));
    setDragId(null);
    if (!source || source.id === target.id) return;
    if (source.group.id !== target.group.id) {
      toast.message("Drag within one group — sub-tags and merges stay inside a group");
      return;
    }
    setDrop({ source, target });
  };

  return (
    <div className="space-y-4">
      <div className="flex max-w-sm items-center gap-2 rounded-lg border border-white/15 bg-muted/30 px-2.5">
        <Search size={14} className="text-muted-foreground" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a tag…"
          aria-label="Find a tag"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const rows = treeOrder(g.tags).filter(
            ({ tag }) =>
              !norm ||
              tag.name.toLowerCase().includes(norm) ||
              g.name.toLowerCase().includes(norm) ||
              (tag.aliases ?? []).some((a) => a.name.toLowerCase().includes(norm)),
          );
          if (norm && rows.length === 0) return null;
          return (
            <section key={g.id} className="rounded-2xl border border-white/15 bg-card/60 p-4 shadow-sm backdrop-blur-sm" aria-label={g.name}>
              <header className="mb-2 flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                <h2 className="text-sm font-semibold">{g.name}</h2>
                {g.isExclusive && <Lock size={11} className="text-muted-foreground" aria-label="one per item" />}
                {g.kind === "WORKFLOW" && <ListTodo size={12} className="text-amber-400" aria-label="workflow" />}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.domain.toLowerCase()}
                  {g.typicalLevel ? ` · ${g.typicalLevel === "MEDIA_ITEM" ? "image" : g.typicalLevel.toLowerCase()}` : ""}
                </span>
              </header>
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet — create them while tagging (palette, T).</p>
              ) : (
                <ul className="space-y-0.5">
                  {rows.map(({ tag, depth }) => (
                    <li
                      key={tag.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/tag-id", tag.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(tag.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(e) => {
                        if (dragId && dragId !== tag.id) e.preventDefault();
                      }}
                      onDrop={(e) => onDrop(e, tag)}
                      className={cn(
                        "group/row flex flex-wrap items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors duration-150 hover:bg-muted/40",
                        dragId === tag.id && "opacity-40",
                      )}
                      style={{ paddingLeft: `${0.25 + depth * 1.1}rem` }}
                    >
                      <GripVertical size={12} className="shrink-0 cursor-grab text-muted-foreground/40" aria-hidden="true" />
                      {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                      {renaming?.id === tag.id ? (
                        <input
                          value={renaming.value}
                          onChange={(e) => setRenaming({ id: tag.id, value: e.target.value })}
                          onKeyDown={(e) => {
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
                      {(sharedName.get(tag.name.toLowerCase()) ?? []).length > 1 && (
                        <span
                          title={`“${tag.name}” is a tag in ${(sharedName.get(tag.name.toLowerCase()) ?? []).join(" and ")} — ambiguous on its own (use group:name, #group=name). Renaming one makes it unique.`}
                          className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                        >
                          ambiguous
                        </span>
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
                      </span>
                      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: tag.id, value: tag.name })}
                          className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={`Rename ${tag.name}`}
                        >
                          <Pencil size={11} />
                        </button>
                        <select
                          value={tag.parentId ?? ""}
                          onChange={(e) => moveUnder(tag, e.target.value || null)}
                          className="max-w-[6rem] rounded border border-white/15 bg-transparent px-0.5 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring [&>option]:text-black"
                          aria-label={`Move ${tag.name} under`}
                          title="Move under…"
                        >
                          <option value="">top level</option>
                          {g.tags
                            .filter((t) => t.id !== tag.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                under {t.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setMergeSource(tag);
                            setMergeKey((k) => k + 1);
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={`Merge ${tag.name} into another tag`}
                        >
                          <GitMerge size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(tag)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={`Delete ${tag.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </span>
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

      {mergeSource && (
        <TagMergeDialog
          key={mergeKey}
          open
          onClose={() => setMergeSource(null)}
          sourceTags={[mergeSource]}
          allTags={allTags}
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
                if (drop) moveUnder(drop.source, drop.target.id);
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
