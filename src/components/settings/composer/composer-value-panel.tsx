"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ComposerCatalog } from "@/lib/composer";
import { BODY_REGIONS } from "@/lib/constants/body-regions";
import type { SimpleActionResult } from "@/lib/types";
import { updateComposerValueAction } from "@/lib/actions/composer-manage-actions";
import { ComposerTextField } from "./composer-text-field";
import { ComposerDrawingUpload } from "./composer-drawing-upload";
import { ComposerValueRelations } from "./composer-value-relations";

export type ComposerValuePanelProps = {
  catalog: ComposerCatalog;
  tagId: string;
  usage: number;
  regionCatalogId: string | null;
  confusables: string[];
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
  onOpen: (tagId: string) => void;
  onRefresh: () => void;
};

/**
 * A value: its name and definition, the body region it stands for (a Region
 * value — the Detail bridge looks there), its line drawing and its relations.
 */
export function ComposerValuePanel({ catalog, tagId, usage, regionCatalogId, confusables, call, pending, onOpen, onRefresh }: ComposerValuePanelProps) {
  const tag = catalog.tags[tagId];
  if (!tag) return null;
  const group = catalog.groups[tag.groupId];
  const save = (data: Parameters<typeof updateComposerValueAction>[1]) => call(() => updateComposerValueAction(tagId, data));
  // The region link is offered in a facet that has one already, or is called Region
  const regional = /region/i.test(group?.name ?? "") || (group?.tagIds ?? []).some((t) => catalog.tags[t]?.region);

  return (
    <div className="space-y-5" data-testid="composer-panel-value">
      <div className="grid gap-3 sm:grid-cols-2">
        <ComposerTextField label="Name" value={tag.name} required onSave={(name) => save({ name })} testId="composer-value-name" />
        <div className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
          <span>
            in <span className="font-medium text-foreground">{group?.name}</span> · on {usage} photo{usage === 1 ? "" : "s"}
          </span>
          <Link
            href={`/tags/${tagId}`}
            className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Aliases, merge, delete <ExternalLink size={11} aria-hidden />
          </Link>
        </div>
      </div>
      <ComposerTextField
        label="Definition (shown in the tag card)"
        value={tag.description ?? ""}
        multiline
        onSave={(description) => save({ description: description || null })}
      />

      {regional && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Body region (the Detail bridge offers the person&apos;s marks there)</span>
          <select
            value={regionCatalogId ?? ""}
            disabled={pending}
            data-testid="composer-value-region"
            onChange={(e) => void save({ regionCatalogId: e.target.value || null }).catch(() => {})}
            className="w-full rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <option value="">— none —</option>
            {BODY_REGIONS.map((r) => (
              <optgroup key={r.id} label={r.label}>
                <option value={r.id}>{r.label}</option>
                {(r.subRegions ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {r.label} › {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <ComposerDrawingUpload tagId={tagId} tagName={tag.name} drawingUrl={tag.drawingUrl ?? null} onChanged={onRefresh} />

      <ComposerValueRelations catalog={catalog} tagId={tagId} confusables={confusables} call={call} pending={pending} onOpen={onOpen} />
    </div>
  );
}
