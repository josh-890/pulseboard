"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import { DeleteButton } from "@/components/shared/delete-button";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type { EraContributionInfo } from "@/lib/services/era-service";
import { deleteEraAction, updateEraAction, promoteEraAction } from "@/lib/actions/appearance-actions";
import { ScalarDeltaInlineEditor } from "@/components/people/scalar-delta-inline-editor";
import { useNudgeDismissal, NUDGE_THRESHOLD_DELTAS } from "@/lib/hooks/use-nudge-dismissal";

type EraItem = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>["eras"][number];

type EraTimelineEntryProps = {
  era: EraItem;
  personId: string;
  connectAbove?: boolean;
  connectBelow?: boolean;
  // ADR-0004 reverse-nav: contributions filed into this Era. Loaded by the
  // parent via `getPersonEraContributions` (separate from getPersonWithDetails
  // to keep Prisma type inference within budget).
  contributions?: EraContributionInfo;
};

export function EraTimelineEntry({ era, personId, connectAbove, connectBelow, contributions }: EraTimelineEntryProps) {
  const [editing, setEditing] = useState<"label" | "notes" | false>(false);
  const [isPending, startTransition] = useTransition();
  const [promoting, setPromoting] = useState(false);
  const [editingDeltaId, setEditingDeltaId] = useState<string | null>(null);

  // Inline edit state
  const [savedLabel, setSavedLabel] = useState(era.label);
  const [savedNotes, setSavedNotes] = useState(era.notes ?? "");
  const [draftLabel, setDraftLabel] = useState(era.label);
  const [draftNotes, setDraftNotes] = useState(era.notes ?? "");

  // Phase G Slice 9: dateless draft Eras get the "Undated changes" treatment.
  const isUndatedDrawer = !era.isBaseline && era.isDraft && era.date === null;

  // Phase G Slice 9: curation nudge eligibility — draft Era with ≥N deltas
  // that the user hasn't dismissed recently.
  const populatedDeltas = useMemo(
    () => era.scalarDeltas.filter((d) => d.value.trim() !== ""),
    [era.scalarDeltas],
  );
  const [nudgeDismissed, dismissNudge] = useNudgeDismissal(era.id);
  const showNudge =
    !era.isBaseline &&
    era.isDraft &&
    populatedDeltas.length >= NUDGE_THRESHOLD_DELTAS &&
    !nudgeDismissed &&
    !promoting &&
    !editing;

  // Per-delta initial intent for the inline editor.
  const intentForDelta = (deltaDate: Date | null): "on-date" | "dateless" | "baseline" => {
    if (era.isBaseline) return "baseline";
    if (deltaDate === null) return "dateless";
    return "on-date";
  };

  const startEditing = useCallback((field: "label" | "notes") => {
    setDraftLabel(savedLabel);
    setDraftNotes(savedNotes);
    setEditing(field);
  }, [savedLabel, savedNotes]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const saveEditing = useCallback(() => {
    if (!draftLabel.trim()) {
      toast.error("Label is required.");
      return;
    }
    startTransition(async () => {
      const result = await updateEraAction(era.id, personId, {
        label: draftLabel.trim(),
        notes: draftNotes.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to update era.");
        return;
      }
      setSavedLabel(draftLabel.trim());
      setSavedNotes(draftNotes.trim());
      toast.success("Era updated.");
      setEditing(false);
    });
  }, [era.id, personId, draftLabel, draftNotes]);

  return (
    <div className="group relative pl-6">
      {/* Timeline connector lines */}
      {connectAbove && (
        <div
          className="absolute left-[5px] top-0 h-[14px] w-px bg-slate-300 dark:bg-white/10"
          aria-hidden="true"
        />
      )}
      {connectBelow && (
        <div
          className="absolute left-[5px] top-[14px] w-px bg-slate-300 dark:bg-white/10"
          style={{ bottom: "-1rem" }}
          aria-hidden="true"
        />
      )}
      {/* Timeline dot — dashed border for draft (auto-created, uncurated) eras */}
      <div
        className={cn(
          "absolute left-0 top-2 h-3 w-3 rounded-full border-2",
          era.isBaseline
            ? "border-primary bg-primary"
            : era.isDraft
              ? "border-amber-500/60 border-dashed bg-amber-500/10"
              : "border-muted-foreground/40 bg-muted-foreground/20",
        )}
        aria-hidden="true"
      />

      <div className={cn(
        "rounded-xl border bg-card/40 p-4 transition-colors",
        editing || promoting ? "border-primary/30 bg-card/60" : "border-white/10",
        isUndatedDrawer && !editing && !promoting && "border-amber-500/30 bg-amber-500/5",
      )}>
        {/* Header — always visible */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="e.g. March 2024, Post-surgery..."
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-muted/30 px-2.5 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus={editing === "label"}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditing();
                if (e.key === "Escape") cancelEditing();
              }}
            />
          ) : isUndatedDrawer ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Undated changes
            </span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={() => startEditing("label")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEditing("label"); }}
              className="font-medium rounded px-1 -mx-1 transition-colors hover:bg-muted/30 cursor-text"
            >
              {savedLabel}
            </span>
          )}
          {era.isBaseline && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Baseline
            </span>
          )}
          {!era.isBaseline && era.isDraft && (
            <span
              className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              title="Auto-created to host an event. Edit the label or notes to curate it."
            >
              Draft
            </span>
          )}
          {era.date && (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {formatPartialDate(era.date, era.datePrecision)}
            </span>
          )}

          {/* Delete button — hover-visible (no pencil needed, click label/notes to edit) */}
          {!editing && !era.isBaseline && (
            <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <DeleteButton
                title={`Delete "${savedLabel}"?`}
                description="This will delete the era and all linked events. The entities themselves (body marks, modifications, procedures) will not be deleted."
                onDelete={() => deleteEraAction(era.id, personId)}
              />
            </div>
          )}
        </div>

        {/* Notes — click-to-edit */}
        {editing ? (
          <div className="mb-2 space-y-2">
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Context about this era..."
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              autoFocus={editing === "notes"}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditing();
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEditing}
                disabled={isPending || !draftLabel.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isPending}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : savedNotes ? (
          <p
            role="button"
            tabIndex={0}
            onClick={() => startEditing("notes")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEditing("notes"); }}
            className="mb-2 text-sm text-muted-foreground italic rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted/30 cursor-text"
          >
            {savedNotes}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => startEditing("notes")}
            className="mb-2 text-sm text-muted-foreground/50 italic hover:text-muted-foreground transition-colors"
          >
            Add notes...
          </button>
        )}

        {/* Phase G Slice 9: curation nudge. Inline, soft-amber, dismissible. */}
        {showNudge && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => setPromoting(true)}
              className="text-left text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 transition-colors"
            >
              {populatedDeltas.length} changes saved here — <span className="font-medium underline-offset-2 hover:underline">Name this phase?</span>
            </button>
            <button
              type="button"
              onClick={dismissNudge}
              className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss for 7 days"
              aria-label="Dismiss nudge"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Phase G Slice 9: promotion sheet — name + checkbox list of deltas. */}
        {promoting && (
          <PromotionSheet
            eraId={era.id}
            personId={personId}
            initialName={savedLabel === `${era.date?.getUTCFullYear()}` || savedLabel === "Undated changes" ? "" : savedLabel}
            deltas={populatedDeltas}
            onCancel={() => setPromoting(false)}
            onSaved={(newName) => {
              setSavedLabel(newName);
              setPromoting(false);
            }}
          />
        )}

        {/* Physical changes — per-delta editor in Undated drawer; pills elsewhere. */}
        {populatedDeltas.length > 0 && !promoting && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {isUndatedDrawer ? "Set a date for each:" : "Physical changes"}
            </p>
            {isUndatedDrawer ? (
              <div className="space-y-1.5">
                {populatedDeltas.map((d) => {
                  const isEditing = editingDeltaId === d.id;
                  if (isEditing) {
                    return (
                      <ScalarDeltaInlineEditor
                        key={d.id}
                        delta={{
                          ...d,
                          cause: d.cause as "NATURAL" | "SURGICAL" | "OTHER",
                          attributeDefinition: {
                            ...d.attributeDefinition,
                            valueType: d.attributeDefinition.valueType as "TEXT" | "NUMERIC" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN" | "ORDINAL",
                          },
                        }}
                        personId={personId}
                        initialIntent={intentForDelta(d.date)}
                        onClose={() => setEditingDeltaId(null)}
                      />
                    );
                  }
                  const unit = d.attributeDefinition.unit ? ` ${d.attributeDefinition.unit}` : "";
                  return (
                    <div
                      key={d.id}
                      className="group flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1 text-sm"
                    >
                      <span className="text-foreground/80">
                        <span className="text-muted-foreground">{d.attributeDefinition.name}:</span> {d.value}{unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingDeltaId(d.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        <Pencil size={12} /> Set date
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {populatedDeltas.map((d) => {
                  const unit = d.attributeDefinition.unit ? ` ${d.attributeDefinition.unit}` : "";
                  return (
                    <span
                      key={d.id}
                      className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2.5 py-0.5 text-xs text-foreground/80"
                    >
                      {d.attributeDefinition.name}: {d.value}{unit}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Body mark events */}
        {era.bodyMarkEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Body marks
            </p>
            <div className="space-y-0.5">
              {era.bodyMarkEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== era.date?.getTime()
                  ? formatPartialDate(event.date, event.datePrecision)
                  : null;
                return (
                  <p key={event.id} className="text-sm text-foreground/80">
                    <span className="capitalize font-medium text-muted-foreground">{event.eventType}</span>
                    {" — "}
                    <span className="capitalize">{event.bodyMark.type}</span>
                    {event.bodyMark.motif ? `, ${event.bodyMark.motif}` : ""}
                    {event.bodyMark.side ? `, ${event.bodyMark.side} ${event.bodyMark.bodyRegion}` : `, ${event.bodyMark.bodyRegion}`}
                    {eventDateStr && <span className="ml-1 text-xs text-muted-foreground/60">({eventDateStr})</span>}
                  </p>
                );
              })}
            </div>
          </div>
        )}

        {/* Body modification events */}
        {era.bodyModificationEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Body modifications
            </p>
            <div className="space-y-0.5">
              {era.bodyModificationEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== era.date?.getTime()
                  ? formatPartialDate(event.date, event.datePrecision)
                  : null;
                return (
                  <p key={event.id} className="text-sm text-foreground/80">
                    <span className="capitalize font-medium text-muted-foreground">{event.eventType}</span>
                    {" — "}
                    <span className="capitalize">{event.bodyModification.type}</span>
                    {event.bodyModification.side ? `, ${event.bodyModification.side} ${event.bodyModification.bodyRegion}` : `, ${event.bodyModification.bodyRegion}`}
                    {eventDateStr && <span className="ml-1 text-xs text-muted-foreground/60">({eventDateStr})</span>}
                  </p>
                );
              })}
            </div>
          </div>
        )}

        {/* Cosmetic procedure events */}
        {era.cosmeticProcedureEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Cosmetic procedures
            </p>
            <div className="space-y-0.5">
              {era.cosmeticProcedureEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== era.date?.getTime()
                  ? formatPartialDate(event.date, event.datePrecision)
                  : null;
                return (
                  <p key={event.id} className="text-sm text-foreground/80">
                    <span className="capitalize font-medium text-muted-foreground">{event.eventType}</span>
                    {" — "}
                    <span className="capitalize">{event.cosmeticProcedure.type}</span>
                    {`, ${event.cosmeticProcedure.bodyRegion}`}
                    {eventDateStr && <span className="ml-1 text-xs text-muted-foreground/60">({eventDateStr})</span>}
                  </p>
                );
              })}
            </div>
          </div>
        )}

        {/* Digital identity changes */}
        {era.digitalIdentities.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Digital identities
            </p>
            <div className="space-y-0.5">
              {era.digitalIdentities.map((di) => (
                <p key={di.id} className="text-sm text-foreground/80">
                  <span className="font-medium">{di.platform}</span>
                  {di.handle ? ` — ${di.handle}` : ""}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Sessions filed into this era — ADR-0004 reverse navigation */}
        {contributions && contributions.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Sessions ({contributions.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {contributions.map((c) => (
                <a
                  key={c.id}
                  href={`/sessions/${c.session.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-muted/40 px-2 py-0.5 text-xs text-foreground/80 hover:border-white/25 hover:bg-card/60 transition-colors"
                  title={`${c.roleDefinition.name} — ${c.session.type}`}
                >
                  <span className="font-medium">{c.session.name}</span>
                  {c.session.date && (
                    <span className="text-muted-foreground">
                      ({new Date(c.session.date).getUTCFullYear()})
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Promotion sheet ────────────────────────────────────────────────────────
// Phase G Slice 9 / ADR-0006: inline editor that promotes a draft Era to
// curated, with optional split — unchecked deltas move out to per-date
// draft Eras via the action's autoCluster routing.

type PromotionDelta = {
  id: string;
  value: string;
  date: Date | null;
  datePrecision: string;
  attributeDefinition: { name: string; unit: string | null };
};

function PromotionSheet({
  eraId,
  personId,
  initialName,
  deltas,
  onCancel,
  onSaved,
}: {
  eraId: string;
  personId: string;
  initialName: string;
  deltas: PromotionDelta[];
  onCancel: () => void;
  onSaved: (newName: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [keptIds, setKeptIds] = useState<Set<string>>(() => new Set(deltas.map((d) => d.id)));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const splitIds = deltas.map((d) => d.id).filter((id) => !keptIds.has(id));
  const allUnchecked = splitIds.length === deltas.length && deltas.length > 0;

  const toggle = (id: string) => {
    setKeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (allUnchecked) {
      setError("At least one change must stay in this Era. Uncheck fewer, or cancel.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await promoteEraAction(eraId, personId, { name: trimmed, splitDeltaIds: splitIds });
      if (!result.success) {
        setError(result.error ?? "Failed to promote Era.");
        return;
      }
      toast.success("Era named.");
      onSaved(trimmed);
    });
  }, [eraId, personId, name, splitIds, allUnchecked, onSaved]);

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-primary/30 bg-card/60 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Name this phase</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Post-surgery, Short-blonde era…"
          className="w-full rounded-lg border border-white/15 bg-muted/30 px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>

      {deltas.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Changes to keep in this Era ({keptIds.size} of {deltas.length})
          </p>
          <p className="mb-2 text-xs text-muted-foreground/70">
            Uncheck a row to split it out into its own draft Era based on its date.
          </p>
          <div className="space-y-1">
            {deltas.map((d) => {
              const checked = keptIds.has(d.id);
              const unit = d.attributeDefinition.unit ? ` ${d.attributeDefinition.unit}` : "";
              const dateStr = d.date
                ? formatPartialDate(d.date, d.datePrecision)
                : "(no date)";
              return (
                <label key={d.id} className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(d.id)}
                  />
                  <span className={cn("flex-1 text-foreground/80", !checked && "line-through opacity-60")}>
                    <span className="text-muted-foreground">{d.attributeDefinition.name}:</span> {d.value}{unit}
                  </span>
                  <span className="text-xs text-muted-foreground/60">{dateStr}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : splitIds.length > 0 ? `Save & split ${splitIds.length}` : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
