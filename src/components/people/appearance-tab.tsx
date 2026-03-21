"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";
import type {
  PersonCurrentState,
  BodyMarkWithEvents,
  BodyModificationWithEvents,
  CosmeticProcedureWithEvents,
} from "@/lib/types";
import { BodyMarkRow } from "@/components/people/body-mark-row";
import { BodyModificationRow } from "@/components/people/body-modification-row";
import { CosmeticProcedureRow } from "@/components/people/cosmetic-procedure-row";
import { AppearanceBodyMap } from "@/components/people/appearance-body-map";
import { AddBodyMarkSheet } from "@/components/people/add-body-mark-sheet";
import { EditBodyMarkSheet } from "@/components/people/edit-body-mark-sheet";
import { AddBodyModificationSheet } from "@/components/people/add-body-modification-sheet";
import { EditBodyModificationSheet } from "@/components/people/edit-body-modification-sheet";
import { AddCosmeticProcedureSheet } from "@/components/people/add-cosmetic-procedure-sheet";
import { EditCosmeticProcedureSheet } from "@/components/people/edit-cosmetic-procedure-sheet";
import { AddBodyMarkEventDialog } from "@/components/people/add-body-mark-event-dialog";
import { AddBodyModificationEventDialog } from "@/components/people/add-body-modification-event-dialog";
import { AddCosmeticProcedureEventDialog } from "@/components/people/add-cosmetic-procedure-event-dialog";
import { EditEventDialog } from "@/components/people/edit-event-dialog";
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
  updateBodyMarkEventAction,
  updateBodyModificationEventAction,
  updateCosmeticProcedureEventAction,
} from "@/lib/actions/appearance-actions";
import {
  BODY_MARK_EVENT_TYPES,
  BODY_MARK_EVENT_STYLES,
  BODY_MODIFICATION_EVENT_TYPES,
  BODY_MODIFICATION_EVENT_STYLES,
  COSMETIC_PROCEDURE_EVENT_TYPES,
  COSMETIC_PROCEDURE_EVENT_STYLES,
} from "@/lib/constants/body";
import {
  Activity,
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
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";

type PersonData = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type PhysicalAttributeItem = {
  definitionId: string;
  name: string;
  unit: string | null;
  value: string;
};

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
  attributes: PhysicalAttributeItem[];
};

type EventItem = {
  id: string;
  eventType: string;
  notes: string | null;
  persona: { id: string; label: string; date: Date | null; datePrecision?: string; isBaseline?: boolean };
};

type AppearanceOpenState =
  | null
  | "physicalChange"
  | "addBodyMark"
  | { type: "editBodyMark"; mark: BodyMarkWithEvents }
  | { type: "addBodyMarkEvent"; markId: string; markLabel: string; computed: BodyMarkWithEvents["computed"] }
  | { type: "editBodyMarkEvent"; event: EventItem; markId: string; eventOverrides: { bodyRegions: string[]; motif: string | null; colors: string[]; size: string | null; description: string | null } }
  | "addBodyMod"
  | { type: "editBodyMod"; modification: BodyModificationWithEvents }
  | { type: "addBodyModEvent"; modId: string; modLabel: string; computed: BodyModificationWithEvents["computed"] }
  | { type: "editBodyModEvent"; event: EventItem; modId: string; eventOverrides: { bodyRegions: string[]; description: string | null; material: string | null; gauge: string | null } }
  | "addCosmProc"
  | { type: "editCosmProc"; procedure: CosmeticProcedureWithEvents }
  | { type: "addCosmProcEvent"; procId: string; procLabel: string; computed: CosmeticProcedureWithEvents["computed"] }
  | { type: "editCosmProcEvent"; event: EventItem; procId: string; eventOverrides: { bodyRegions: string[]; description: string | null; provider: string | null; valueBefore: string | null; valueAfter: string | null; unit: string | null } }
  | { type: "editPhysical"; item: PhysicalChangeItem }
  | { type: "manageEntityPhotos"; entityId: string; entityModel: string; entityLabel: string };

export type AppearanceTabProps = {
  person: PersonData;
  currentState: PersonCurrentState;
  entityMedia?: Record<string, EntityMediaThumbnail[]>;
  categories?: CategoryWithGroup[];
  referenceSessionId?: string;
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
};

export function AppearanceTab({
  person,
  currentState,
  entityMedia,
  categories,
  referenceSessionId,
  attributeGroups,
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
  const hasExtensible = Object.keys(currentState.extensibleAttributes).length > 0;

  // Group extensible attributes by group name for display
  const extensibleByGroup = useMemo(() => {
    const groups: Record<string, { name: string; unit: string | null; value: string; status: import("@/lib/types").AttributeStatus }[]> = {};
    for (const attr of Object.values(currentState.extensibleAttributes)) {
      if (!groups[attr.groupName]) groups[attr.groupName] = [];
      groups[attr.groupName].push({ name: attr.name, unit: attr.unit, value: attr.value, status: attr.status });
    }
    return groups;
  }, [currentState.extensibleAttributes]);

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
        attributes: (p.physicalChange!.attributes ?? []).map((a: { attributeDefinitionId: string; value: string; attributeDefinition: { name: string; unit: string | null } }) => ({
          definitionId: a.attributeDefinitionId,
          name: a.attributeDefinition.name,
          unit: a.attributeDefinition.unit,
          value: a.value,
        })),
      }));
  }, [person.personas]);

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

  const addButton = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
    >
      <Plus size={12} />
      Add
    </button>
  );

  return (
    <>
      <div className="flex gap-6">
        {/* Left column — content (constrained width) */}
        <div className="min-w-0 max-w-2xl flex-1 space-y-6">
          {/* Physical Stats */}
          <SectionCard
            title="Physical Stats"
            icon={<Activity size={18} />}
            accent="indigo"
            action={
              <button
                type="button"
                onClick={() => setOpenState("physicalChange")}
                className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
              >
                <Plus size={12} />
                Record Change
              </button>
            }
          >
            {!hasStatic && !hasComputed && !hasExtensible ? (
              <EmptyState message="No physical stats recorded." />
            ) : (
              <>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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

                {/* Extensible Physical Attributes */}
                {hasExtensible && (
                  <div className="mt-3 space-y-3">
                    {Object.entries(extensibleByGroup).map(([groupName, attrs]) => (
                      <div key={groupName}>
                        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{groupName}</h4>
                        <dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                          {attrs.map((attr) => {
                            const displayValue = attr.unit ? `${attr.value} ${attr.unit}` : attr.value;
                            const statusBadge = attr.status !== "NATURAL" ? (
                              <span className={cn(
                                "ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                                attr.status === "ENHANCED" && "bg-purple-500/20 text-purple-400",
                                attr.status === "RESTORED" && "bg-emerald-500/20 text-emerald-400",
                              )}>
                                {attr.status === "ENHANCED" ? "Enhanced" : "Restored"}
                              </span>
                            ) : null;
                            return (
                              <div key={attr.name} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
                                <dt className="w-28 shrink-0 text-xs text-muted-foreground">{attr.name}</dt>
                                <dd className="text-sm text-foreground">
                                  {displayValue}{statusBadge}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}

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
                        for (const attr of item.attributes) {
                          fields.push(`${attr.name}: ${attr.value}${attr.unit ? ` ${attr.unit}` : ""}`);
                        }

                        return (
                          <div
                            key={item.physicalId}
                            className="group/change flex items-start gap-3 rounded-lg border border-white/10 bg-muted/20 px-3 py-2"
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
                              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/change:opacity-100"
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
            accent="amber"
            action={addButton(() => setOpenState("addBodyMark"))}
          >
            {currentState.activeBodyMarks.length === 0 ? (
              <EmptyState message="No body marks recorded." />
            ) : (
              <div className="space-y-2">
                {currentState.activeBodyMarks.map((mark) => (
                  <BodyMarkRow
                    key={mark.id}
                    mark={mark}
                    photos={entityMedia?.[mark.id]}
                    onEdit={() => setOpenState({ type: "editBodyMark", mark })}
                    onDelete={() => handleDeleteBodyMark(mark.id)}
                    onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: mark.id, entityModel: "BodyMark", entityLabel: `${mark.type} — ${mark.bodyRegion}` }) : undefined}
                    onDeleteEvent={handleDeleteBodyMarkEvent}
                    onAddEvent={() => setOpenState({ type: "addBodyMarkEvent", markId: mark.id, markLabel: `${mark.type} — ${mark.bodyRegion}`, computed: mark.computed })}
                    onEditEvent={(event) => {
                      const fullEvent = mark.events.find((e) => e.id === event.id);
                      setOpenState({ type: "editBodyMarkEvent", event, markId: mark.id, eventOverrides: { bodyRegions: fullEvent?.bodyRegions ?? [], motif: fullEvent?.motif ?? null, colors: fullEvent?.colors ?? [], size: fullEvent?.size ?? null, description: fullEvent?.description ?? null } });
                    }}
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
            accent="teal"
            action={addButton(() => setOpenState("addBodyMod"))}
          >
            {currentState.activeBodyModifications.length === 0 ? (
              <EmptyState message="No body modifications recorded." />
            ) : (
              <div className="space-y-2">
                {currentState.activeBodyModifications.map((mod) => (
                  <BodyModificationRow
                    key={mod.id}
                    modification={mod}
                    photos={entityMedia?.[mod.id]}
                    onEdit={() => setOpenState({ type: "editBodyMod", modification: mod })}
                    onDelete={() => handleDeleteBodyMod(mod.id)}
                    onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: mod.id, entityModel: "BodyModification", entityLabel: `${mod.type} — ${mod.bodyRegion}` }) : undefined}
                    onDeleteEvent={handleDeleteBodyModEvent}
                    onAddEvent={() => setOpenState({ type: "addBodyModEvent", modId: mod.id, modLabel: `${mod.type} — ${mod.bodyRegion}`, computed: mod.computed })}
                    onEditEvent={(event) => {
                      const fullEvent = mod.events.find((e) => e.id === event.id);
                      setOpenState({ type: "editBodyModEvent", event, modId: mod.id, eventOverrides: { bodyRegions: fullEvent?.bodyRegions ?? [], description: fullEvent?.description ?? null, material: fullEvent?.material ?? null, gauge: fullEvent?.gauge ?? null } });
                    }}
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
            accent="rose"
            action={addButton(() => setOpenState("addCosmProc"))}
          >
            {currentState.activeCosmeticProcedures.length === 0 ? (
              <EmptyState message="No cosmetic procedures recorded." />
            ) : (
              <div className="space-y-2">
                {currentState.activeCosmeticProcedures.map((proc) => (
                  <CosmeticProcedureRow
                    key={proc.id}
                    procedure={proc}
                    photos={entityMedia?.[proc.id]}
                    onEdit={() => setOpenState({ type: "editCosmProc", procedure: proc })}
                    onDelete={() => handleDeleteCosmProc(proc.id)}
                    onManagePhotos={referenceSessionId ? () => setOpenState({ type: "manageEntityPhotos", entityId: proc.id, entityModel: "CosmeticProcedure", entityLabel: `${proc.type} — ${proc.bodyRegion}` }) : undefined}
                    onDeleteEvent={handleDeleteCosmProcEvent}
                    onAddEvent={() => setOpenState({ type: "addCosmProcEvent", procId: proc.id, procLabel: `${proc.type} — ${proc.bodyRegion}`, computed: proc.computed })}
                    onEditEvent={(event) => {
                      const fullEvent = proc.events.find((e) => e.id === event.id);
                      setOpenState({ type: "editCosmProcEvent", event, procId: proc.id, eventOverrides: { bodyRegions: fullEvent?.bodyRegions ?? [], description: fullEvent?.description ?? null, provider: fullEvent?.provider ?? null, valueBefore: fullEvent?.valueBefore ?? null, valueAfter: fullEvent?.valueAfter ?? null, unit: fullEvent?.unit ?? null } });
                    }}
                    isPending={isPending}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column — sticky body map (hidden below lg) */}
        <div className="hidden w-[380px] shrink-0 lg:block">
          <div className="sticky top-6">
            <AppearanceBodyMap currentState={currentState} />
          </div>
        </div>
      </div>

      {/* Body map below content on smaller screens */}
      <div className="mt-6 flex justify-center lg:hidden">
        <AppearanceBodyMap currentState={currentState} />
      </div>

      {/* Sheets & Dialogs */}
      {openState === "physicalChange" && (
        <RecordPhysicalChangeSheet personId={person.id} attributeGroups={attributeGroups} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editPhysical" && (
        <EditPhysicalChangeSheet personId={person.id} item={openState.item} attributeGroups={attributeGroups} onClose={handleSheetClose} />
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
          currentComputed={openState.computed}
          onClose={handleSheetClose}
        />
      )}
      {typeof openState === "object" && openState?.type === "editBodyMarkEvent" && (
        <EditEventDialog
          event={openState.event}
          entityId={openState.markId}
          eventTypes={BODY_MARK_EVENT_TYPES as unknown as string[]}
          eventStyles={BODY_MARK_EVENT_STYLES}
          entityKind="bodyMark"
          overrides={openState.eventOverrides}
          onSave={(data) => updateBodyMarkEventAction(openState.event.id, person.id, {
            bodyMarkId: openState.markId,
            eventType: data.eventType,
            date: data.date,
            datePrecision: data.datePrecision,
            notes: data.notes,
            bodyRegions: data.bodyRegions,
            motif: data.motif,
            colors: data.colors,
            size: data.size,
            description: data.description,
          })}
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
          currentComputed={openState.computed}
          onClose={handleSheetClose}
        />
      )}
      {typeof openState === "object" && openState?.type === "editBodyModEvent" && (
        <EditEventDialog
          event={openState.event}
          entityId={openState.modId}
          eventTypes={BODY_MODIFICATION_EVENT_TYPES as unknown as string[]}
          eventStyles={BODY_MODIFICATION_EVENT_STYLES}
          entityKind="bodyModification"
          overrides={openState.eventOverrides}
          onSave={(data) => updateBodyModificationEventAction(openState.event.id, person.id, {
            bodyModificationId: openState.modId,
            eventType: data.eventType,
            date: data.date,
            datePrecision: data.datePrecision,
            notes: data.notes,
            bodyRegions: data.bodyRegions,
            description: data.description,
            material: data.material,
            gauge: data.gauge,
          })}
          onClose={handleSheetClose}
        />
      )}
      {openState === "addCosmProc" && (
        <AddCosmeticProcedureSheet personId={person.id} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("CosmeticProcedure")?.id} attributeGroups={attributeGroups} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "editCosmProc" && (
        <EditCosmeticProcedureSheet personId={person.id} procedure={openState.procedure} referenceSessionId={referenceSessionId} categoryId={findCategoryForEntity("CosmeticProcedure")?.id} existingPhotos={entityMedia?.[openState.procedure.id]} attributeGroups={attributeGroups} onClose={handleSheetClose} />
      )}
      {typeof openState === "object" && openState?.type === "addCosmProcEvent" && (
        <AddCosmeticProcedureEventDialog
          personId={person.id}
          cosmeticProcedureId={openState.procId}
          procedureLabel={openState.procLabel}
          currentComputed={openState.computed}
          onClose={handleSheetClose}
        />
      )}
      {typeof openState === "object" && openState?.type === "editCosmProcEvent" && (
        <EditEventDialog
          event={openState.event}
          entityId={openState.procId}
          eventTypes={COSMETIC_PROCEDURE_EVENT_TYPES as unknown as string[]}
          eventStyles={COSMETIC_PROCEDURE_EVENT_STYLES}
          entityKind="cosmeticProcedure"
          overrides={openState.eventOverrides}
          onSave={(data) => updateCosmeticProcedureEventAction(openState.event.id, person.id, {
            cosmeticProcedureId: openState.procId,
            eventType: data.eventType,
            date: data.date,
            datePrecision: data.datePrecision,
            notes: data.notes,
            bodyRegions: data.bodyRegions,
            description: data.description,
            provider: data.provider,
            valueBefore: data.valueBefore,
            valueAfter: data.valueAfter,
            unit: data.unit,
          })}
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
