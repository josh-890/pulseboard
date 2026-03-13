import type {
  BodyMarkType,
  BodyMarkStatus,
  BodyMarkEventType,
  BodyModificationType,
  BodyModificationStatus,
  BodyModificationEventType,
  CosmeticProcedureEventType,
} from "@/generated/prisma/client";

// ─── Body Mark Styles ────────────────────────────────────────────────────────

export const BODY_MARK_TYPE_STYLES: Record<BodyMarkType, string> = {
  tattoo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  scar: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  mark: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  burn: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  deformity: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  other: "bg-muted/50 text-muted-foreground border-white/15",
};

export const BODY_MARK_STATUS_STYLES: Record<BodyMarkStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  modified: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  removed: "bg-slate-500/15 text-slate-500 border-slate-500/30 line-through",
};

export const BODY_MARK_EVENT_STYLES: Record<BodyMarkEventType, { color: string; label: string }> = {
  added: { color: "text-green-400", label: "Added" },
  modified: { color: "text-amber-400", label: "Modified" },
  removed: { color: "text-red-400", label: "Removed" },
};

export const BODY_MARK_TYPES: BodyMarkType[] = ["tattoo", "scar", "mark", "burn", "deformity", "other"];
export const BODY_MARK_STATUSES: BodyMarkStatus[] = ["present", "modified", "removed"];
export const BODY_MARK_EVENT_TYPES: BodyMarkEventType[] = ["added", "modified", "removed"];

// ─── Body Modification Styles ────────────────────────────────────────────────

export const BODY_MODIFICATION_TYPE_STYLES: Record<BodyModificationType, string> = {
  piercing: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  stretching: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  branding: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  scarification: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  implant: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30",
  teeth: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  jewelry: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  other: "bg-muted/50 text-muted-foreground border-white/15",
};

export const BODY_MODIFICATION_STATUS_STYLES: Record<BodyModificationStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  removed: "bg-slate-500/15 text-slate-500 border-slate-500/30 line-through",
  overgrown: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  modified: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
};

export const BODY_MODIFICATION_EVENT_STYLES: Record<BodyModificationEventType, { color: string; label: string }> = {
  added: { color: "text-green-400", label: "Added" },
  modified: { color: "text-amber-400", label: "Modified" },
  removed: { color: "text-red-400", label: "Removed" },
};

export const BODY_MODIFICATION_TYPES: BodyModificationType[] = [
  "piercing", "stretching", "branding", "scarification", "implant", "teeth", "jewelry", "other",
];
export const BODY_MODIFICATION_STATUSES: BodyModificationStatus[] = ["present", "removed", "overgrown", "modified"];
export const BODY_MODIFICATION_EVENT_TYPES: BodyModificationEventType[] = ["added", "modified", "removed"];

// ─── Cosmetic Procedure Styles ───────────────────────────────────────────────

export const COSMETIC_PROCEDURE_EVENT_STYLES: Record<CosmeticProcedureEventType, { color: string; label: string }> = {
  performed: { color: "text-green-400", label: "Performed" },
  revised: { color: "text-amber-400", label: "Revised" },
  reversed: { color: "text-red-400", label: "Reversed" },
};

export const COSMETIC_PROCEDURE_EVENT_TYPES: CosmeticProcedureEventType[] = ["performed", "revised", "reversed"];
