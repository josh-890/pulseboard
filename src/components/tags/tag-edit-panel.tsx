"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, FolderInput, GitMerge, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TagMergeDialog } from "@/components/settings/tag-merge-dialog";
import { createTagAliasAction, deleteTagAliasAction, updateTagDefinitionAction } from "@/lib/actions/tag-actions";
import type { TagTreeGroup, TagTreeTag } from "@/lib/services/tag-browse-service";
import { toTagName } from "@/lib/tag-names";
import type { TagLevel } from "@/generated/prisma/enums";
import { TagDeleteDialog } from "./tag-delete-dialog";
import { TagMoveDialog } from "./tag-move-dialog";
import { TagNameClashHint } from "./tag-name-clash-hint";
import { TagParentDialog } from "./tag-parent-dialog";

export type TagEditPanelProps = {
  /** The tag, with its usage counts (from the catalogue tree) */
  tag: TagTreeTag;
  aliases: { id: string; name: string }[];
  groups: TagTreeGroup[];
  /** Open on arrival (`?edit=1`, from the ⋯ menu in /tags) */
  initiallyOpen?: boolean;
};

const LEVELS: { value: TagLevel | ""; label: string }[] = [
  { value: "", label: "Group default" },
  { value: "SESSION", label: "Session" },
  { value: "SET", label: "Set" },
  { value: "MEDIA_ITEM", label: "Image" },
];

// Editing one tag on its own page (2026-10-10): name, description, typical level
// and aliases in place; group, parent, merge and delete through the same dialogs
// as the catalogue, so every path runs the same checks.
export function TagEditPanel({ tag, aliases, groups, initiallyOpen = false }: TagEditPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState(tag.name);
  const [description, setDescription] = useState(tag.description ?? "");
  const [level, setLevel] = useState<TagLevel | "">(tag.typicalLevel ?? "");
  const [alias, setAlias] = useState("");
  const [dialog, setDialog] = useState<"move" | "parent" | "merge" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const allTags = groups.flatMap((g) => g.tags);

  const save = () =>
    startTransition(async () => {
      const next = toTagName(name);
      if (!next) {
        toast.error("A tag name needs letters or digits");
        return;
      }
      const res = await updateTagDefinitionAction(tag.id, {
        ...(next !== tag.name ? { name: next } : {}),
        description: description.trim() || null,
        typicalLevel: level || null,
      });
      if (!res.success) {
        toast.error(res.error ?? "Could not save");
        return;
      }
      toast.success("Saved");
      setName(next);
      router.refresh();
    });

  const addAlias = () =>
    alias.trim() &&
    startTransition(async () => {
      const res = await createTagAliasAction(tag.id, alias.trim());
      if (!res.success) {
        toast.error(res.error ?? "Could not add the alias");
        return;
      }
      setAlias("");
      router.refresh();
    });

  const removeAlias = (id: string) =>
    startTransition(async () => {
      const res = await deleteTagAliasAction(id);
      if (!res.success) toast.error(res.error ?? "Could not remove the alias");
      router.refresh();
    });

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pencil size={13} /> Edit
      </Button>
    );
  }

  return (
    <section aria-label="Edit tag" className="mt-4 space-y-4 rounded-xl border border-white/15 bg-muted/20 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="tag-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="tag-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-md border border-white/15 bg-background/60 px-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <TagNameClashHint name={name} groupName={tag.group.name} excludeId={tag.id} onUseSuggestion={setName} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="tag-level" className="text-xs font-medium text-muted-foreground">
            Typical level
          </label>
          <select
            id="tag-level"
            value={level}
            onChange={(e) => setLevel(e.target.value as TagLevel | "")}
            className="h-9 w-full rounded-md border border-white/15 bg-background/60 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&>option]:text-black"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tag-description" className="text-xs font-medium text-muted-foreground">
          Description
        </label>
        <Textarea
          id="tag-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="What it means — when to use it, when not"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Aliases — other spellings that find this tag (also as #files)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {aliases.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-xs">
              {a.name}
              <button
                type="button"
                onClick={() => removeAlias(a.id)}
                disabled={isPending}
                className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove alias ${a.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addAlias();
            }}
            placeholder="add an alias…"
            aria-label="New alias"
            className="h-7 w-36 rounded-md border border-white/15 bg-background/60 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={addAlias} disabled={!alias.trim() || isPending}>
            <Plus size={12} /> Add
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <Button size="sm" onClick={save} disabled={isPending} className="gap-1.5">
          {isPending && <Loader2 size={13} className="animate-spin" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Close
        </Button>
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("move")}>
          <FolderInput size={13} /> Move to group…
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("parent")}>
          <CornerDownRight size={13} /> Sub-tag of…
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("merge")}>
          <GitMerge size={13} /> Merge into…
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setDialog("delete")}>
          <Trash2 size={13} /> Delete…
        </Button>
      </div>

      {dialog === "move" && (
        <TagMoveDialog
          tags={[{ id: tag.id, name: tag.name, groupId: tag.group.id }]}
          groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color, domain: g.domain, isExclusive: g.isExclusive }))}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onMoved={() => router.refresh()}
          onMergeInstead={() => setDialog("merge")}
        />
      )}
      {dialog === "parent" && (
        <TagParentDialog
          tags={[tag]}
          candidates={allTags.map((t) => ({ id: t.id, name: t.name, groupName: t.group.name, color: t.group.color }))}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onDone={() => router.refresh()}
        />
      )}
      {dialog === "merge" && <TagMergeDialog open onClose={() => setDialog(null)} sourceTags={[tag]} allTags={allTags} />}
      {dialog === "delete" && (
        <TagDeleteDialog tags={[tag]} open onOpenChange={(o) => !o && setDialog(null)} onDeleted={() => router.push("/tags")} />
      )}
    </section>
  );
}
