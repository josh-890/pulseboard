"use client";

import { useState } from "react";
import { Grid3x3, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ComposerCatalog, ComposerPath, FacetChoice, RelevanceLevel } from "@/lib/composer";
import { DEFAULT_FRAMING, FRAMING } from "@/lib/tag-example";
import type { SimpleActionResult } from "@/lib/types";
import { createComposerValueAction, updateComposerFacetAction } from "@/lib/actions/composer-manage-actions";
import { ComposerSegmented } from "./composer-segmented";
import { ComposerTextField } from "./composer-text-field";
import { TILE_SHAPES } from "./composer-tile-shapes";

export type ComposerFacetPanelProps = {
  catalog: ComposerCatalog;
  groupId: string;
  path: ComposerPath | undefined;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
  /** Open the relevance matrix on this facet's path */
  onRelevance: () => void;
  /** A value was added — select it */
  onAdded: (tagId: string) => void;
};

const pct = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 100)));

/**
 * A facet (a tag group in a section): one or many answers, its level where no
 * context has a say, how its examples are framed, and "+ value".
 */
export function ComposerFacetPanel({ catalog, groupId, path, call, pending, onRelevance, onAdded }: ComposerFacetPanelProps) {
  const group = catalog.groups[groupId];
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  if (!group) return null;
  const save = (data: Parameters<typeof updateComposerFacetAction>[1]) => call(() => updateComposerFacetAction(groupId, data));
  const base = FRAMING[path?.name ?? ""] ?? DEFAULT_FRAMING;
  const framing = group.framing ?? {};

  /** "85" → 0.85; empty → inherit; anything else refused */
  const fraction = (text: string, what: string): number | null => {
    if (!text) return null;
    const n = Number(text.replace(",", ".").replace("%", ""));
    if (!Number.isFinite(n)) {
      toast.error(`${what}: a number in percent`);
      throw new Error("not a number");
    }
    return n / 100;
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    setBusy(true);
    const r = await createComposerValueAction(groupId, name);
    setBusy(false);
    if (!r.success) return void toast.error(r.error);
    setAdding("");
    toast.success(`${r.tag.name} added to ${group.name}`);
    onAdded(r.tag.id);
  };

  return (
    <div className="space-y-5" data-testid="composer-panel-facet">
      <div className="flex flex-wrap items-end gap-4">
        <ComposerSegmented<FacetChoice>
          label="Answers"
          value={group.choice ?? "MANY"}
          options={[
            { value: "ONE", label: "One", hint: "A pick replaces the facet's other value (Shift adds a second — two people)" },
            { value: "MANY", label: "Many", hint: "Values are toggled one by one" },
          ]}
          onChange={(choice) => void save({ choice }).catch(() => {})}
          disabled={pending}
          testId="composer-facet-choice"
        />
        <ComposerSegmented<RelevanceLevel>
          label="Where no context has a say"
          value={group.defaultLevel ?? "POSSIBLE"}
          options={[
            { value: "TYPICAL", label: "Typical", hint: "Always shown first" },
            { value: "POSSIBLE", label: "Possible", hint: "Shown; behind “more” where other values are typical" },
            { value: "IMPOSSIBLE", label: "Waits", hint: "Asked only once a context asks for it (the seat waits for sitting)" },
          ]}
          onChange={(defaultLevel) => void save({ defaultLevel }).catch(() => {})}
          disabled={pending}
          testId="composer-facet-default"
        />
      </div>

      <button
        type="button"
        onClick={onRelevance}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Grid3x3 size={13} aria-hidden /> Relevance under each context
      </button>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold">Example framing</legend>
        <p className="text-xs text-muted-foreground">
          How a tile cuts its example from the box drawn around the subject. Empty inherits {path?.name ?? "the path"}: fill{" "}
          {pct(base.fill)} %{base.topMargin !== undefined && `, ${pct(base.topMargin)} % from the top`}, {path?.tileAspect ?? "1:1"}. A change
          cuts this facet&apos;s examples again.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <ComposerTextField
            label="Subject fills (%)"
            value={pct(framing.fill ?? undefined)}
            placeholder={pct(base.fill)}
            onSave={(t) => save({ framingFill: fraction(t, "Fill") })}
            testId="composer-facet-fill"
          />
          <ComposerTextField
            label="From the top (%)"
            value={pct(framing.top ?? undefined)}
            placeholder={base.topMargin !== undefined ? pct(base.topMargin) : "centred"}
            onSave={(t) => save({ framingTop: fraction(t, "Top margin") })}
          />
        </div>
        <ComposerSegmented
          label="Tile shape"
          value={framing.tileAspect ?? "inherit"}
          options={[{ value: "inherit", label: `Path (${path?.tileAspect ?? "1:1"})` }, ...TILE_SHAPES.map((s) => ({ value: s, label: s }))]}
          onChange={(v) => void save({ tileAspect: v === "inherit" ? null : v }).catch(() => {})}
          disabled={pending}
        />
      </fieldset>

      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor="composer-add-value" className="text-xs font-semibold">
          Add a value
        </label>
        <div className="flex gap-2">
          <input
            id="composer-add-value"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="e.g. knee-to-chest"
            disabled={busy}
            data-testid="composer-add-value"
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !adding.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />} Add
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">It joins the end of the facet and inherits its relevance.</p>
      </form>
    </div>
  );
}
