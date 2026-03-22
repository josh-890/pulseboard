"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { cn } from "@/lib/utils";
import type { BodyMarkWithEvents, BodyModificationWithEvents, CosmeticProcedureWithEvents } from "@/lib/types";
import type { BodyMarkType, BodyModificationType, BodyMarkEventType, BodyModificationEventType, CosmeticProcedureEventType } from "@/generated/prisma/client";
import { BODY_MARK_TYPES, BODY_MARK_TYPE_STYLES, BODY_MARK_EVENT_TYPES, BODY_MARK_EVENT_STYLES, BODY_MODIFICATION_TYPES, BODY_MODIFICATION_TYPE_STYLES, BODY_MODIFICATION_EVENT_TYPES, BODY_MODIFICATION_EVENT_STYLES, COSMETIC_PROCEDURE_EVENT_TYPES, COSMETIC_PROCEDURE_EVENT_STYLES } from "@/lib/constants/body";
import { createPersonaBatchAction } from "@/lib/actions/appearance-actions";

type NewBodyMark = {
  type: BodyMarkType;
  bodyRegion: string;
  side?: string;
  position?: string;
  description?: string;
  motif?: string;
  colors: string[];
  size?: string;
  status: "present" | "modified" | "removed";
};

type NewBodyMod = {
  type: BodyModificationType;
  bodyRegion: string;
  side?: string;
  position?: string;
  description?: string;
  material?: string;
  gauge?: string;
  status: "present" | "removed" | "overgrown" | "modified";
};

type NewCosmProc = {
  type: string;
  bodyRegion: string;
  description?: string;
  provider?: string;
  status: string;
};

type ExistingMarkEvent = { bodyMarkId: string; eventType: BodyMarkEventType; notes?: string };
type ExistingModEvent = { bodyModificationId: string; eventType: BodyModificationEventType; notes?: string };
type ExistingProcEvent = { cosmeticProcedureId: string; eventType: CosmeticProcedureEventType; notes?: string };

type NewPersonaSheetProps = {
  personId: string;
  existingMarks: BodyMarkWithEvents[];
  existingMods: BodyModificationWithEvents[];
  existingProcs: CosmeticProcedureWithEvents[];
  onClose: () => void;
};

// ── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-muted/20">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors">
        <span>{title} {count > 0 && <span className="ml-1 text-xs text-muted-foreground">({count})</span>}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="border-t border-white/10 px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Inline sub-form for new body mark ────────────────────────────────────────

function InlineBodyMarkForm({ onAdd }: { onAdd: (mark: NewBodyMark) => void }) {
  const [type, setType] = useState<BodyMarkType>("tattoo");
  const [bodyRegion, setBodyRegion] = useState("");
  const [motif, setMotif] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-white/15 p-3">
      <p className="text-xs font-medium text-muted-foreground">New Body Mark</p>
      <div className="flex flex-wrap gap-1.5">
        {BODY_MARK_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize transition-all",
              type === t ? BODY_MARK_TYPE_STYLES[t] : "border-white/15 text-muted-foreground hover:border-white/30")}>
            {t}
          </button>
        ))}
      </div>
      <input type="text" value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)} placeholder="Body region..."
        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (optional)..."
        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <button type="button" disabled={!bodyRegion.trim()}
        onClick={() => { onAdd({ type, bodyRegion: bodyRegion.trim(), motif: motif.trim() || undefined, colors: [], status: "present" }); setBodyRegion(""); setMotif(""); }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50">
        <Plus size={12} /> Add to persona
      </button>
    </div>
  );
}

// ── Inline sub-form for new body modification ────────────────────────────────

function InlineBodyModForm({ onAdd }: { onAdd: (mod: NewBodyMod) => void }) {
  const [type, setType] = useState<BodyModificationType>("piercing");
  const [bodyRegion, setBodyRegion] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-white/15 p-3">
      <p className="text-xs font-medium text-muted-foreground">New Body Modification</p>
      <div className="flex flex-wrap gap-1.5">
        {BODY_MODIFICATION_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize transition-all",
              type === t ? BODY_MODIFICATION_TYPE_STYLES[t] : "border-white/15 text-muted-foreground hover:border-white/30")}>
            {t}
          </button>
        ))}
      </div>
      <input type="text" value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)} placeholder="Body region..."
        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <button type="button" disabled={!bodyRegion.trim()}
        onClick={() => { onAdd({ type, bodyRegion: bodyRegion.trim(), status: "present" }); setBodyRegion(""); }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50">
        <Plus size={12} /> Add to persona
      </button>
    </div>
  );
}

// ── Inline sub-form for new cosmetic procedure ───────────────────────────────

function InlineCosmProcForm({ onAdd }: { onAdd: (proc: NewCosmProc) => void }) {
  const [type, setType] = useState("");
  const [bodyRegion, setBodyRegion] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-white/15 p-3">
      <p className="text-xs font-medium text-muted-foreground">New Cosmetic Procedure</p>
      <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Procedure type..."
        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <input type="text" value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)} placeholder="Body region..."
        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <button type="button" disabled={!type.trim() || !bodyRegion.trim()}
        onClick={() => { onAdd({ type: type.trim(), bodyRegion: bodyRegion.trim(), status: "completed" }); setType(""); setBodyRegion(""); }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50">
        <Plus size={12} /> Add to persona
      </button>
    </div>
  );
}

// ── Main sheet ───────────────────────────────────────────────────────────────

export function NewPersonaSheet({
  personId,
  existingMarks,
  existingMods,
  existingProcs,
  onClose,
}: NewPersonaSheetProps) {
  const [isPending, startTransition] = useTransition();

  // Persona metadata
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");

  // Physical changes
  const [currentHairColor, setCurrentHairColor] = useState("");
  const [weight, setWeight] = useState("");
  const [build, setBuild] = useState("");

  // Events for existing entities
  const [markEvents, setMarkEvents] = useState<ExistingMarkEvent[]>([]);
  const [modEvents, setModEvents] = useState<ExistingModEvent[]>([]);
  const [procEvents, setProcEvents] = useState<ExistingProcEvent[]>([]);

  // New entities
  const [newMarks, setNewMarks] = useState<NewBodyMark[]>([]);
  const [newMods, setNewMods] = useState<NewBodyMod[]>([]);
  const [newProcs, setNewProcs] = useState<NewCosmProc[]>([]);

  const [error, setError] = useState<string | null>(null);

  const totalChanges = markEvents.length + modEvents.length + procEvents.length +
    newMarks.length + newMods.length + newProcs.length +
    (currentHairColor || weight || build ? 1 : 0);

  const handleSubmit = useCallback(() => {
    if (!label.trim()) { setError("Label is required."); return; }
    startTransition(async () => {
      setError(null);
      const result = await createPersonaBatchAction(personId, {
        label: label.trim(),
        date: date || undefined,
        datePrecision: datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY",
        notes: notes.trim() || undefined,
        currentHairColor: currentHairColor.trim() || undefined,
        weight: weight.trim() ? parseFloat(weight) : undefined,
        build: build.trim() || undefined,
        bodyMarkEvents: markEvents,
        bodyModificationEvents: modEvents,
        cosmeticProcedureEvents: procEvents,
        newBodyMarks: newMarks,
        newBodyModifications: newMods,
        newCosmeticProcedures: newProcs,
      });
      if (!result.success) { setError(result.error ?? "Failed to create persona."); return; }
      onClose();
    });
  }, [personId, label, date, datePrecision, notes, currentHairColor, weight, build, markEvents, modEvents, procEvents, newMarks, newMods, newProcs, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">New Persona</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Persona metadata */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. March 2024, Post-surgery..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
          </div>

          <PartialDateInput
            dateValue={date}
            precisionValue={datePrecision}
            onDateChange={setDate}
            onPrecisionChange={setDatePrecision}
            label="Date"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context about this persona..." rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          {/* Physical Changes */}
          <CollapsibleSection title="Physical Changes" count={currentHairColor || weight || build ? 1 : 0}>
            <p className="text-xs text-muted-foreground/60 mb-2">Only fill in what changed.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Hair Color</label>
                <input type="text" value={currentHairColor} onChange={(e) => setCurrentHairColor(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Weight (kg)</label>
                <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} step="0.1" min="0"
                  className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Build</label>
                <input type="text" value={build} onChange={(e) => setBuild(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Body Mark Events */}
          <CollapsibleSection title="Body Mark Events" count={markEvents.length + newMarks.length}>
            {existingMarks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-xs font-medium text-muted-foreground">Existing marks</p>
                {existingMarks.map((mark) => {
                  const existing = markEvents.find((e) => e.bodyMarkId === mark.id);
                  return (
                    <div key={mark.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">
                        <span className="capitalize font-medium">{mark.type}</span>
                        {" — "}{mark.bodyRegion}
                      </span>
                      <div className="flex gap-1">
                        {BODY_MARK_EVENT_TYPES.map((et) => {
                          const style = BODY_MARK_EVENT_STYLES[et];
                          const isSelected = existing?.eventType === et;
                          return (
                            <button key={et} type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setMarkEvents((prev) => prev.filter((e) => e.bodyMarkId !== mark.id));
                                } else {
                                  setMarkEvents((prev) => [
                                    ...prev.filter((e) => e.bodyMarkId !== mark.id),
                                    { bodyMarkId: mark.id, eventType: et },
                                  ]);
                                }
                              }}
                              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                                isSelected ? `${style.color} border-current bg-current/10` : "border-white/15 text-muted-foreground hover:border-white/30")}>
                              {style.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {newMarks.length > 0 && (
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-muted-foreground">New marks (will be created with &quot;added&quot; event)</p>
                {newMarks.map((mark, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="flex-1"><span className="capitalize font-medium">{mark.type}</span> — {mark.bodyRegion}</span>
                    <button type="button" onClick={() => setNewMarks((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-muted-foreground/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <InlineBodyMarkForm onAdd={(mark) => setNewMarks((prev) => [...prev, mark])} />
          </CollapsibleSection>

          {/* Body Modification Events */}
          <CollapsibleSection title="Body Modification Events" count={modEvents.length + newMods.length}>
            {existingMods.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-xs font-medium text-muted-foreground">Existing modifications</p>
                {existingMods.map((mod) => {
                  const existing = modEvents.find((e) => e.bodyModificationId === mod.id);
                  return (
                    <div key={mod.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">
                        <span className="capitalize font-medium">{mod.type}</span>
                        {" — "}{mod.bodyRegion}
                      </span>
                      <div className="flex gap-1">
                        {BODY_MODIFICATION_EVENT_TYPES.map((et) => {
                          const style = BODY_MODIFICATION_EVENT_STYLES[et];
                          const isSelected = existing?.eventType === et;
                          return (
                            <button key={et} type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setModEvents((prev) => prev.filter((e) => e.bodyModificationId !== mod.id));
                                } else {
                                  setModEvents((prev) => [
                                    ...prev.filter((e) => e.bodyModificationId !== mod.id),
                                    { bodyModificationId: mod.id, eventType: et },
                                  ]);
                                }
                              }}
                              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                                isSelected ? `${style.color} border-current bg-current/10` : "border-white/15 text-muted-foreground hover:border-white/30")}>
                              {style.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {newMods.length > 0 && (
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-muted-foreground">New modifications (will be created with &quot;added&quot; event)</p>
                {newMods.map((mod, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="flex-1"><span className="capitalize font-medium">{mod.type}</span> — {mod.bodyRegion}</span>
                    <button type="button" onClick={() => setNewMods((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-muted-foreground/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <InlineBodyModForm onAdd={(mod) => setNewMods((prev) => [...prev, mod])} />
          </CollapsibleSection>

          {/* Cosmetic Procedure Events */}
          <CollapsibleSection title="Cosmetic Procedure Events" count={procEvents.length + newProcs.length}>
            {existingProcs.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-xs font-medium text-muted-foreground">Existing procedures</p>
                {existingProcs.map((proc) => {
                  const existing = procEvents.find((e) => e.cosmeticProcedureId === proc.id);
                  return (
                    <div key={proc.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">
                        <span className="capitalize font-medium">{proc.type}</span>
                        {" — "}{proc.bodyRegion}
                      </span>
                      <div className="flex gap-1">
                        {COSMETIC_PROCEDURE_EVENT_TYPES.map((et) => {
                          const style = COSMETIC_PROCEDURE_EVENT_STYLES[et];
                          const isSelected = existing?.eventType === et;
                          return (
                            <button key={et} type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setProcEvents((prev) => prev.filter((e) => e.cosmeticProcedureId !== proc.id));
                                } else {
                                  setProcEvents((prev) => [
                                    ...prev.filter((e) => e.cosmeticProcedureId !== proc.id),
                                    { cosmeticProcedureId: proc.id, eventType: et },
                                  ]);
                                }
                              }}
                              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                                isSelected ? `${style.color} border-current bg-current/10` : "border-white/15 text-muted-foreground hover:border-white/30")}>
                              {style.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {newProcs.length > 0 && (
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-muted-foreground">New procedures (will be created with &quot;performed&quot; event)</p>
                {newProcs.map((proc, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="flex-1"><span className="capitalize font-medium">{proc.type}</span> — {proc.bodyRegion}</span>
                    <button type="button" onClick={() => setNewProcs((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-muted-foreground/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <InlineCosmProcForm onAdd={(proc) => setNewProcs((prev) => [...prev, proc])} />
          </CollapsibleSection>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isPending || !label.trim()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Creating..." : `Create Persona${totalChanges > 0 ? ` (${totalChanges} change${totalChanges > 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
