"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  BodyMarkWithEvents,
  BodyModificationWithEvents,
  CosmeticProcedureWithEvents,
} from "@/lib/types";
import { BodyMarkCard } from "@/components/people/body-mark-card";
import { BodyModificationCard } from "@/components/people/body-modification-card";
import { CosmeticProcedureCard } from "@/components/people/cosmetic-procedure-card";
import { AddBodyMarkSheet } from "@/components/people/add-body-mark-sheet";
import { EditBodyMarkSheet } from "@/components/people/edit-body-mark-sheet";
import { AddBodyModificationSheet } from "@/components/people/add-body-modification-sheet";
import { EditBodyModificationSheet } from "@/components/people/edit-body-modification-sheet";
import { AddCosmeticProcedureSheet } from "@/components/people/add-cosmetic-procedure-sheet";
import { EditCosmeticProcedureSheet } from "@/components/people/edit-cosmetic-procedure-sheet";
import { AddBodyMarkEventDialog } from "@/components/people/add-body-mark-event-dialog";
import { AddBodyModificationEventDialog } from "@/components/people/add-body-modification-event-dialog";
import { AddCosmeticProcedureEventDialog } from "@/components/people/add-cosmetic-procedure-event-dialog";
import { RecordPhysicalChangeSheet } from "@/components/people/record-physical-change-sheet";
import { EditPhysicalChangeSheet } from "@/components/people/edit-physical-change-sheet";
import { DetailMediaPickerSheet } from "@/components/people/detail-media-picker-sheet";
import {
  deleteBodyMarkAction,
  deleteBodyMarkEventAction,
  deleteBodyModificationAction,
  deleteBodyModificationEventAction,
  deleteCosmeticProcedureAction,
  deleteCosmeticProcedureEventAction,
} from "@/lib/actions/appearance-actions";
import {
  Activity,
  Eye,
  Fingerprint,
  Pencil,
  Plus,
  Wrench,
  Sparkles,
} from "lucide-react";
import { SectionCard, EmptyState, InfoRow } from "@/components/people/person-detail-helpers";
import { formatPartialDate } from "@/lib/utils";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type PhysicalChangeItem = {
  physicalId: string;
  personaId: string;
  personaLabel: string;
  isBaseline: boolean;
  date: Date | null;
  datePrecision: string;
  currentHairColor: string | null;
  weight: number | null;
  build: string | null;
  visionAids: string | null;
  fitnessLevel: string | null;
};

type AppearanceOpenState =
  | null
  | "physicalChange"
  | "addBodyMark"
  | { type: "editBodyMark"; mark: BodyMarkWithEvents }
  | { type: "addBodyMarkEvent"; markId: string; markLabel: string }
  | "addBodyMod"
  | { type: "editBodyMod"; modification: BodyModificationWithEvents }
  | { type: "addBodyModEvent"; modId: string; modLabel: string }
  | "addCosmProc"
  | { type: "editCosmProc"; procedure: CosmeticProcedureWithEvents }
  | { type: "addCosmProcEvent"; procId: string; procLabel: string }
  | { type: "editPhysical"; item: PhysicalChangeItem }
  | { type: "manageEntityPhotos"; entityId: string; entityModel: string; entityLabel: string };

export type AppearanceTabProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  personas: { id: string; label: string }[];
  entityMedia?: Record<string, EntityMediaThumbnail[]>;
  categories?: CategoryWithGroup[];
  referenceSessionId?: string;
};

export function AppearanceTab({
  person,
  currentState,
  personas,
  entityMedia,
  categories,
  referenceSessionId,
}: AppearanceTabProps) {
  const router = useRouter();
  const [openState, setOpenState] = useState<AppearanceOpenState>(null);
  const [isPending, startTransition] = useTransition();

  const handleSheetClose = useCallback(() => {
    setOpenState(null);
    router.refresh();
  }, [router]);

  const hasStatic = person.height || person.eyeColor || person.naturalHairColor || person.bodyType || person.measurements;
  const hasComputed = currentState.currentHairColor || currentState.weight !== null || currentState.build || currentState.visionAids || currentState.fitnessLevel;

  // Build physical change history from personas
  const physicalChanges = useMemo<PhysicalChangeItem[]>(() => {
    return person.personas
      .filter((p) => p.physicalChange)
      .map((p) => ({
        physicalId: p.physicalChange!.id,
        personaId: p.id,
        personaLabel: p.label,
        isBaseline: p.isBaseline,
        date: p.date,
        datePrecision: p.datePrecision,
        currentHairColor: p.physicalChange!.currentHairColor,
        weight: p.physicalChange!.weight,
        build: p.physicalChange!.build,
        visionAids: p.physicalChange!.visionAids,
        fitnessLevel: p.physicalChange!.fitnessLevel,
      }));
  }, [person.personas]);

  const hasSnapshot = hasStatic || hasComputed || currentState.activeBodyMarks.length > 0 || currentState.activeBodyModifications.length > 0 || currentState.activeCosmeticProcedures.length > 0;

  const handleDeleteBodyMark = useCallback((markId: string) => {
    startTransition(async () => {
      await deleteBodyMarkAction(markId, person.id);
    });
  }, [person.id]);

  const handleDeleteBodyMarkEvent = useCallback(async (eventId: string) => {
    return deleteBodyMarkEventAction(eventId, person.id);
  }, [person.id]);

  const handleDeleteBodyMod = useCallback((modId: string) => {
    startTransition(async () => {
      await deleteBodyModificationAction(modId, person.id);
    });
  }, [person.id]);

  const handleDeleteBodyModEvent = useCallback(async (eventId: string) => {
    return deleteBodyModificationEventAction(eventId, person.id);
  }, [person.id]);

  const handleDeleteCosmProc = useCallback((procId: string) => {
    startTransition(async () => {
      await deleteCosmeticProcedureAction(procId, person.id);
    });
  }, [person.id]);

  const handleDeleteCosmProcEvent = useCallback(async (eventId: string) => {
    return deleteCosmeticProcedureEventAction(eventId, person.id);
  }, [person.id]);

  // Resolve entity model → matching category for photo picker
  const findCategoryForEntity = useCallback(
    (entityModel: string) => {
      if (!categories) return undefined;
      return categories.find((c) => c.entityModel === entityModel);
    },
    [categories],
  );

  // Get entities list for the picker dropdown (same entity model)
  const getEntitiesForModel = useCallback(
    (entityModel: string) => {
      if (entityModel === "BodyMark") {
        return currentState.activeBodyMarks.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      if (entityModel === "BodyModification") {
        return currentState.activeBodyModifications.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      if (entityModel === "CosmeticProcedure") {
        return currentState.activeCosmeticProcedures.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      return undefined;
    },
    [currentState],
  );

  // The currently selected picker category (derived from openState)
  const pickerCategory =
    typeof openState === "object" && openState?.type === "manageEntityPhotos"
      ? findCategoryForEntity(openState.entityModel)
      : undefined;

  const pickerEntities =
    typeof openState === "object" && openState?.type === "manageEntityPhotos"
      ? getEntitiesForModel(openState.entityModel)
      : undefined;

  return (
    <>
      <div className="space-y-6">
        {/* Current Snapshot */}
        <SectionCard title="Current Snapshot" icon={<Eye size={18} />}>
          {!hasSnapshot ? (
            <EmptyState message="No appearance data recorded yet." />
          ) : (
            <div className="space-y-4">
              {/* Physical Stats */}
              {(hasStatic || hasComputed) && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Physical Stats</h3>
                  <dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                    {person.height && <InfoRow label="Height" value={`${person.height} cm`} labelWidth="w-28" />}
                    {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} labelWidth="w-28" />}
                    {person.naturalHairColor && <InfoRow label="Natural hair" value={<span className="capitalize">{person.naturalHairColor}</span>} labelWidth="w-28" />}
                    {currentState.currentHairColor && <InfoRow label="Current hair" value={<span className="capitalize">{currentState.currentHairColor}</span>} labelWidth="w-28" />}
                    {currentState.weight !== null && currentState.weight !== undefined && <InfoRow label="Weight" value={`${currentState.weight} kg`} labelWidth="w-28" />}
                    {person.bodyType && <InfoRow label="Body type" value={<span className="capitalize">{person.bodyType}</span>} labelWidth="w-28" />}
                    {currentState.build && <InfoRow label="Build" value={<span className="capitalize">{currentState.build}</span>} labelWidth="w-28" />}
                    {person.measurements && <InfoRow label="Measurements" value={person.measurements} labelWidth="w-28" />}
                    {currentState.visionAids && <InfoRow label="Vision aids" value={currentState.visionAids} labelWidth="w-28" />}
                    {currentState.fitnessLevel && <InfoRow label="Fitness" value={<span className="capitalize">{currentState.fitnessLevel}</span>} labelWidth="w-28" />}
                  </dl>
                </div>
              )}

              {/* Active Body Marks */}
              {currentState.activeBodyMarks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Body Marks
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {currentState.activeBodyMarks.length}
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentState.activeBodyMarks.map((mark) => (
                      <span
                        key={mark.id}
                        className="rounded-md border border-white/10 bg-muted/30 px-2 py-1 text-xs"
                      >
                        <span className="capitalize">{mark.type}</span>
                        <span className="mx-1 text-muted-foreground">—</span>
                        {mark.bodyRegion}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Body Modifications */}
              {currentState.activeBodyModifications.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Body Modifications
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {currentState.activeBodyModifications.length}
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentState.activeBodyModifications.map((mod) => (
                      <span
                        key={mod.id}
                        className="rounded-md border border-white/10 bg-muted/30 px-2 py-1 text-xs"
                      >
                        <span className="capitalize">{mod.type}</span>
                        <span className="mx-1 text-muted-foreground">—</span>
                        {mod.bodyRegion}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Cosmetic Procedures */}
              {currentState.activeCosmeticProcedures.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cosmetic Procedures
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {currentState.activeCosmeticProcedures.length}
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentState.activeCosmeticProcedures.map((proc) => (
                      <span
                        key={proc.id}
                        className="rounded-md border border-white/10 bg-muted/30 px-2 py-1 text-xs"
                      >
                        {proc.type}
                        <span className="mx-1 text-muted-foreground">—</span>
                        {proc.bodyRegions?.length ? proc.bodyRegions.join(", ") : proc.bodyRegion}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* Physical Stats */}
        <SectionCard title="Physical Stats" icon={<Activity size={18} />}>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpenState("physicalChange")}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
            >
              <Plus size={12} />
              Record Change
            </button>
          </div>
          {!hasStatic && !hasComputed ? (
            <EmptyState message="No physical stats recorded." />
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                {person.height && <InfoRow label="Height" value={`${person.height} cm`} />}
                {person.eyeColor && <InfoRow label="Eye color" value={<span className="capitalize">{person.eyeColor}</span>} />}
                {person.naturalHairColor && <InfoRow label="Natural hair" value={<span className="capitalize">{person.naturalHairColor}</span>} />}
                {person.bodyType && <InfoRow label="Body type" value={<span className="capitalize">{person.bodyType}</span>} />}
                {person.measurements && <InfoRow label="Measurements" value={person.measurements} />}
              </dl>

              {/* Change History */}
              {physicalChanges.length > 0 && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change History</h3>
                  <div className="space-y-2">
                    {physicalChanges.map((item) => {
                      const fields: string[] = [];
                      if (item.currentHairColor) fields.push(`Hair: ${item.currentHairColor}`);
                      if (item.weight !== null) fields.push(`Weight: ${item.weight} kg`);
                      if (item.build) fields.push(`Build: ${item.build}`);
                      if (item.visionAids) fields.push(`Vision: ${item.visionAids}`);
                      if (item.fitnessLevel) fields.push(`Fitness: ${item.fitnessLevel}`);

                      return (
                        <div
                          key={item.physicalId}
                          className="group flex items-start gap-3 rounded-lg border border-white/10 bg-muted/20 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {formatPartialDate(item.date, item.datePrecision)}
                              </span>
                              <span className="text-xs text-muted-foreground">{item.personaLabel}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {fields.map((f) => (
                                <span
                                  key={f}
                                  className="rounded border border-white/10 bg-muted/30 px-1.5 py-0.5 text-[11px]"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenState({ type: "editPhysical", item })}
                            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                            title="Edit physical change"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>

        {/* Body Marks */}
        <SectionCard
          title="Body Marks"
          icon={<Fingerprint size={18} />}
          badge={currentState.activeBodyMarks.length}
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpenState("addBodyMark")}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          {currentState.activeBodyMarks.length === 0 ? (
            <EmptyState message="No body marks recorded." />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {currentState.activeBodyMarks.map((mark) => (
                <BodyMarkCard
                  key={mark.id}
                  mark={mark}
                  photos={entityMedia?.[mark.id]}
                  onEdit={() => setOpenState({ type: "editBodyMark", mark })}
                  onDelete={() => handleDeleteBodyMark(mark.id)}
                  onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: mark.id, entityModel: "BodyMark", entityLabel: `${mark.type} — ${mark.bodyRegion}` }) : undefined}
                  onDeleteEvent={handleDeleteBodyMarkEvent}
                  onAddEvent={() => setOpenState({ type: "addBodyMarkEvent", markId: mark.id, markLabel: `${mark.type} — ${mark.bodyRegion}` })}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Body Modifications */}
        <SectionCard
          title="Body Modifications"
          icon={<Wrench size={18} />}
          badge={currentState.activeBodyModifications.length}
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpenState("addBodyMod")}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          {currentState.activeBodyModifications.length === 0 ? (
            <EmptyState message="No body modifications recorded." />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {currentState.activeBodyModifications.map((mod) => (
                <BodyModificationCard
                  key={mod.id}
                  modification={mod}
                  photos={entityMedia?.[mod.id]}
                  onEdit={() => setOpenState({ type: "editBodyMod", modification: mod })}
                  onDelete={() => handleDeleteBodyMod(mod.id)}
                  onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: mod.id, entityModel: "BodyModification", entityLabel: `${mod.type} — ${mod.bodyRegion}` }) : undefined}
                  onDeleteEvent={handleDeleteBodyModEvent}
                  onAddEvent={() => setOpenState({ type: "addBodyModEvent", modId: mod.id, modLabel: `${mod.type} — ${mod.bodyRegion}` })}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Cosmetic Procedures */}
        <SectionCard
          title="Cosmetic Procedures"
          icon={<Sparkles size={18} />}
          badge={currentState.activeCosmeticProcedures.length}
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpenState("addCosmProc")}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          {currentState.activeCosmeticProcedures.length === 0 ? (
            <EmptyState message="No cosmetic procedures recorded." />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {currentState.activeCosmeticProcedures.map((proc) => (
                <CosmeticProcedureCard
                  key={proc.id}
                  procedure={proc}
                  photos={entityMedia?.[proc.id]}
                  onEdit={() => setOpenState({ type: "editCosmProc", procedure: proc })}
                  onDelete={() => handleDeleteCosmProc(proc.id)}
                  onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: proc.id, entityModel: "CosmeticProcedure", entityLabel: `${proc.type} — ${proc.bodyRegion}` }) : undefined}
                  onDeleteEvent={handleDeleteCosmProcEvent}
                  onAddEvent={() => setOpenState({ type: "addCosmProcEvent", procId: proc.id, procLabel: `${proc.type} — ${proc.bodyRegion}` })}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Sheets & Dialogs */}
      {openState === "physicalChange" && (
        <RecordPhysicalChangeSheet personId={person.id} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editPhysical" && (
        <EditPhysicalChangeSheet personId={person.id} item={openState.item} onClose={handleSheetClose} />
      )}
      {openState === "addBodyMark" && (
        <AddBodyMarkSheet personId={person.id} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("BodyMark")?.id} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editBodyMark" && (
        <EditBodyMarkSheet personId={person.id} mark={openState.mark} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("BodyMark")?.id} existingPhotos={entityMedia?.[openState.mark.id]} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "addBodyMarkEvent" && (
        <AddBodyMarkEventDialog
          personId={person.id}
          bodyMarkId={openState.markId}
          markLabel={openState.markLabel}
          personas={personas}
          onClose={handleSheetClose}
        />
      )}
      {openState === "addBodyMod" && (
        <AddBodyModificationSheet personId={person.id} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("BodyModification")?.id} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editBodyMod" && (
        <EditBodyModificationSheet personId={person.id} modification={openState.modification} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("BodyModification")?.id} existingPhotos={entityMedia?.[openState.modification.id]} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "addBodyModEvent" && (
        <AddBodyModificationEventDialog
          personId={person.id}
          bodyModificationId={openState.modId}
          modificationLabel={openState.modLabel}
          personas={personas}
          onClose={handleSheetClose}
        />
      )}
      {openState === "addCosmProc" && (
        <AddCosmeticProcedureSheet personId={person.id} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("CosmeticProcedure")?.id} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editCosmProc" && (
        <EditCosmeticProcedureSheet personId={person.id} procedure={openState.procedure} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("CosmeticProcedure")?.id} existingPhotos={entityMedia?.[openState.procedure.id]} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "addCosmProcEvent" && (
        <AddCosmeticProcedureEventDialog
          personId={person.id}
          cosmeticProcedureId={openState.procId}
          procedureLabel={openState.procLabel}
          personas={personas}
          onClose={handleSheetClose}
        />
      )}
      {typeof openState === "object" && openState?.type === "manageEntityPhotos" && pickerCategory && referenceSessionId && (
        <DetailMediaPickerSheet
          personId={person.id}
          referenceSessionId={referenceSessionId}
          category={pickerCategory}
          entities={pickerEntities}
          preselectedEntityId={openState.entityId}
          open
          onOpenChange={(open) => { if (!open) handleSheetClose(); }}
          onLinked={() => { router.refresh(); }}
        />
      )}
    </>
  );
}
