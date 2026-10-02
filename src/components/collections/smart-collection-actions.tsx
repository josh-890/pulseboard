"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Snowflake, Trash2, Undo2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteSavedFilterAction,
  freezeSmartCollectionAction,
  updateSavedFilterAction,
} from "@/lib/actions/saved-filter-actions";

export type SmartCollectionActionsProps = {
  id: string;
  name: string;
  /** The previewed query differs from the stored one */
  dirty: boolean;
  /** The query currently shown (stored or previewed) */
  preview: string;
  total: number;
};

// Smart collection controls (ADR-0033, S6). Save / Revert appear while an
// edited query is being previewed. Freeze copies today's matches into a
// static collection; the smart collection itself stays live.
export function SmartCollectionActions({ id, name, dirty, preview, total }: SmartCollectionActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await updateSavedFilterAction(id, "media", { params: `tags=${encodeURIComponent(preview.trim())}` });
      if (!res.success) {
        toast.error(res.error ?? "Could not save the query");
        return;
      }
      toast.success("Query saved");
      router.replace(pathname);
    });

  const rename = () => {
    const next = window.prompt("Rename smart collection", name);
    if (!next || !next.trim() || next.trim() === name) return;
    startTransition(async () => {
      const res = await updateSavedFilterAction(id, "media", { name: next.trim() });
      if (!res.success) toast.error(res.error ?? "Could not rename");
      router.refresh();
    });
  };

  const freeze = () => {
    const today = new Date().toISOString().slice(0, 10);
    const target = window.prompt(`Copy today's ${total} matching images into a new static collection named:`, `${name} (${today})`);
    if (!target || !target.trim()) return;
    startTransition(async () => {
      const res = await freezeSmartCollectionAction(id, target.trim());
      if (!res.success || !res.collectionId) {
        toast.error(res.error ?? "Could not freeze");
        return;
      }
      toast.success(`Froze ${res.count ?? 0} images into “${target.trim()}”`);
      router.push(`/collections/${res.collectionId}`);
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete the smart collection “${name}”? No image is touched — only the saved query goes.`)) return;
    startTransition(async () => {
      const res = await deleteSavedFilterAction(id, "media");
      if (!res.success) {
        toast.error(res.error ?? "Could not delete");
        return;
      }
      router.push("/collections");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && (
        <>
          <Button size="sm" className="gap-1.5" onClick={save} disabled={isPending}>
            <Save size={14} /> Save query
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => router.replace(pathname)} disabled={isPending}>
            <Undo2 size={14} /> Revert
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" className="gap-1.5" onClick={rename} disabled={isPending}>
        <Pencil size={14} /> Rename
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={freeze}
        disabled={isPending || dirty || total === 0}
        title={dirty ? "Save or revert the query first" : "Copy today's matches into a static collection"}
      >
        <Snowflake size={14} /> Freeze
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={remove} disabled={isPending}>
        <Trash2 size={14} /> Delete
      </Button>
    </div>
  );
}
