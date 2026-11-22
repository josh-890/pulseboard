"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ComposerCatalog } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import {
  createComposerCombinationAction,
  setComposerConfusablesAction,
  setComposerValueParentsAction,
} from "@/lib/actions/composer-manage-actions";
import { ComposerTagChip } from "./composer-tag-chip";
import { ComposerTagPicker } from "./composer-tag-picker";

export type ComposerValueRelationsProps = {
  catalog: ComposerCatalog;
  tagId: string;
  confusables: string[];
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
  onOpen: (tagId: string) => void;
};

/**
 * A value's relations (ADR-0043, R4): what it implies (its parents — the parts,
 * for a named form), what implies it (sub-values and the named forms it is a
 * part of), and what it is not to be confused with. A new named form can be
 * made from this value and further parts.
 */
export function ComposerValueRelations({ catalog, tagId, confusables, call, pending, onOpen }: ComposerValueRelationsProps) {
  const tag = catalog.tags[tagId];
  const [parts, setParts] = useState<string[]>([]);
  const [formName, setFormName] = useState("");
  const [creating, setCreating] = useState(false);

  const children = useMemo(() => Object.values(catalog.tags).filter((t) => t.parentIds.includes(tagId)), [catalog.tags, tagId]);
  // Where a new named form goes: a facet called "Named forms" on the value's path, else the value's own facet
  const formGroupId = useMemo(() => {
    const path = catalog.paths.find((p) => p.sections.some((s) => s.groupIds.includes(tag?.groupId ?? "")));
    const named = path?.sections.flatMap((s) => s.groupIds).find((g) => /named/i.test(catalog.groups[g]?.name ?? ""));
    return named ?? tag?.groupId ?? "";
  }, [catalog, tag]);
  if (!tag) return null;

  const facet = (id: string) => catalog.groups[catalog.tags[id]?.groupId ?? ""]?.name;
  const setParents = (ids: string[]) => call(() => setComposerValueParentsAction(tagId, ids)).catch(() => {});
  const setLookalikes = (ids: string[]) => call(() => setComposerConfusablesAction(tagId, ids)).catch(() => {});

  const createForm = async () => {
    const name = formName.trim();
    if (!name) return;
    setCreating(true);
    const r = await createComposerCombinationAction(formGroupId, name, [tagId, ...parts]);
    setCreating(false);
    if (!r.success) return void toast.error(r.error);
    toast.success(`${r.tag.name} = ${[tagId, ...parts].map((p) => catalog.tags[p]?.name).join(" + ")}`);
    setParts([]);
    setFormName("");
    onOpen(r.tag.id);
  };

  return (
    <section className="space-y-4" aria-label="Relations" data-testid="composer-relations">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold">
            Implies <span className="font-normal text-muted-foreground">{tag.parentIds.length > 1 ? "— its parts" : "— its parent"}</span>
          </h4>
          <div className="flex flex-wrap gap-1" data-testid="composer-relations-parents">
            {tag.parentIds.map((p) => (
              <ComposerTagChip
                key={p}
                name={catalog.tags[p]?.name ?? p}
                facet={facet(p)}
                onOpen={() => onOpen(p)}
                onRemove={() => void setParents(tag.parentIds.filter((x) => x !== p))}
                disabled={pending}
              />
            ))}
            {tag.parentIds.length === 0 && <span className="text-xs text-muted-foreground">nothing</span>}
          </div>
          <ComposerTagPicker
            catalog={catalog}
            label="Add a parent"
            exclude={new Set([tagId, ...tag.parentIds])}
            onPick={(p) => void setParents([...tag.parentIds, p])}
            disabled={pending}
            testId="composer-add-parent"
          />
        </div>
        <ArrowRight size={14} aria-hidden className="mx-auto hidden rotate-180 text-muted-foreground sm:mt-6 sm:block" />
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold">
            Implied by <span className="font-normal text-muted-foreground">— sub-values, named forms</span>
          </h4>
          <div className="flex flex-wrap gap-1" data-testid="composer-relations-children">
            {children.map((c) => (
              <ComposerTagChip key={c.id} name={c.parentIds.length > 1 ? `= ${c.name}` : c.name} facet={facet(c.id)} onOpen={() => onOpen(c.id)} />
            ))}
            {children.length === 0 && <span className="text-xs text-muted-foreground">nothing</span>}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold">
          Not to be confused with <span className="font-normal text-muted-foreground">— shown in the tag card</span>
        </h4>
        <div className="flex flex-wrap gap-1" data-testid="composer-relations-confusables">
          {confusables.map((c) => (
            <ComposerTagChip
              key={c}
              name={catalog.tags[c]?.name ?? "(not in the Composer)"}
              facet={facet(c)}
              onOpen={catalog.tags[c] ? () => onOpen(c) : undefined}
              onRemove={() => void setLookalikes(confusables.filter((x) => x !== c))}
              disabled={pending}
            />
          ))}
        </div>
        <ComposerTagPicker
          catalog={catalog}
          label="Add a look-alike"
          exclude={new Set([tagId, ...confusables])}
          onPick={(c) => void setLookalikes([...confusables, c])}
          disabled={pending}
          testId="composer-add-confusable"
        />
      </div>

      <form
        className="space-y-1.5 rounded-lg border border-dashed border-primary/40 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void createForm();
        }}
        data-testid="composer-new-form"
      >
        <h4 className="flex items-center gap-1 text-xs font-semibold">
          <Sparkles size={12} aria-hidden className="text-primary" /> New named form with {tag.name}
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Choose its other parts and name it; it goes into {catalog.groups[formGroupId]?.name}. The workbench offers it once all parts are
          picked.
        </p>
        <div className="flex flex-wrap gap-1">
          <ComposerTagChip name={tag.name} emphasis />
          {parts.map((p) => (
            <ComposerTagChip key={p} name={catalog.tags[p]?.name ?? p} facet={facet(p)} onRemove={() => setParts(parts.filter((x) => x !== p))} />
          ))}
        </div>
        <ComposerTagPicker catalog={catalog} label="Add a part" exclude={new Set([tagId, ...parts])} onPick={(p) => setParts([...parts, p])} testId="composer-form-part" />
        <div className="flex gap-2">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Its name, e.g. seiza"
            aria-label="Name of the named form"
            data-testid="composer-form-name"
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={creating || parts.length === 0 || !formName.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {creating && <Loader2 size={13} className="animate-spin" aria-hidden />} Create
          </button>
        </div>
      </form>
    </section>
  );
}
