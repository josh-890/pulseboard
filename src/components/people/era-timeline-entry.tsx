"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn, formatPartialDate } from "@/lib/utils";
import { DeleteButton } from "@/components/shared/delete-button";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import { deletePersonaAction, updatePersonaAction } from "@/lib/actions/appearance-actions";

type PersonaItem = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>["personas"][number];

type PersonaTimelineEntryProps = {
  persona: PersonaItem;
  personId: string;
  connectAbove?: boolean;
  connectBelow?: boolean;
};

export function PersonaTimelineEntry({ persona, personId, connectAbove, connectBelow }: PersonaTimelineEntryProps) {
  const [editing, setEditing] = useState<"label" | "notes" | false>(false);
  const [isPending, startTransition] = useTransition();

  // Inline edit state
  const [savedLabel, setSavedLabel] = useState(persona.label);
  const [savedNotes, setSavedNotes] = useState(persona.notes ?? "");
  const [draftLabel, setDraftLabel] = useState(persona.label);
  const [draftNotes, setDraftNotes] = useState(persona.notes ?? "");

  const hasPhysical = !!persona.physicalChange;
  const physicalFields = hasPhysical
    ? [
        persona.physicalChange?.currentHairColor ? `Hair: ${persona.physicalChange.currentHairColor}` : null,
        persona.physicalChange?.weight ? `Weight: ${persona.physicalChange.weight} kg` : null,
        persona.physicalChange?.build ? `Build: ${persona.physicalChange.build}` : null,
      ].filter(Boolean)
    : [];

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
      const result = await updatePersonaAction(persona.id, personId, {
        label: draftLabel.trim(),
        notes: draftNotes.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to update persona.");
        return;
      }
      setSavedLabel(draftLabel.trim());
      setSavedNotes(draftNotes.trim());
      toast.success("Persona updated.");
      setEditing(false);
    });
  }, [persona.id, personId, draftLabel, draftNotes]);

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
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-2 h-3 w-3 rounded-full border-2",
          persona.isBaseline
            ? "border-primary bg-primary"
            : "border-muted-foreground/40 bg-muted-foreground/20",
        )}
        aria-hidden="true"
      />

      <div className={cn(
        "rounded-xl border bg-card/40 p-4 transition-colors",
        editing ? "border-primary/30 bg-card/60" : "border-white/10",
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
          {persona.isBaseline && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Baseline
            </span>
          )}
          {persona.date && (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {formatPartialDate(persona.date, persona.datePrecision)}
            </span>
          )}

          {/* Delete button — hover-visible (no pencil needed, click label/notes to edit) */}
          {!editing && !persona.isBaseline && (
            <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <DeleteButton
                title={`Delete "${savedLabel}"?`}
                description="This will delete the persona and all linked events. The entities themselves (body marks, modifications, procedures) will not be deleted."
                onDelete={() => deletePersonaAction(persona.id, personId)}
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
              placeholder="Context about this persona..."
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

        {/* Physical changes */}
        {physicalFields.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Physical changes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {physicalFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Body mark events */}
        {persona.bodyMarkEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Body marks
            </p>
            <div className="space-y-0.5">
              {persona.bodyMarkEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== persona.date?.getTime()
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
        {persona.bodyModificationEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Body modifications
            </p>
            <div className="space-y-0.5">
              {persona.bodyModificationEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== persona.date?.getTime()
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
        {persona.cosmeticProcedureEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Cosmetic procedures
            </p>
            <div className="space-y-0.5">
              {persona.cosmeticProcedureEvents.map((event) => {
                const eventDateStr = event.date && event.date.getTime() !== persona.date?.getTime()
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
        {persona.digitalIdentities.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Digital identities
            </p>
            <div className="space-y-0.5">
              {persona.digitalIdentities.map((di) => (
                <p key={di.id} className="text-sm text-foreground/80">
                  <span className="font-medium">{di.platform}</span>
                  {di.handle ? ` — ${di.handle}` : ""}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
