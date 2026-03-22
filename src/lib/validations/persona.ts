import { z } from "zod";

// ── Nested event schemas ─────────────────────────────────────────────────────

const bodyMarkEventEntry = z.object({
  bodyMarkId: z.string().min(1),
  eventType: z.enum(["added", "modified", "removed"]),
  notes: z.string().optional(),
});

const newBodyMarkEntry = z.object({
  type: z.enum(["tattoo", "scar", "mark", "burn", "deformity", "other"]),
  bodyRegion: z.string().min(1),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  motif: z.string().optional(),
  colors: z.array(z.string()).default([]),
  size: z.string().optional(),
  status: z.enum(["present", "modified", "removed"]).default("present"),
});

const bodyModEventEntry = z.object({
  bodyModificationId: z.string().min(1),
  eventType: z.enum(["added", "modified", "removed"]),
  notes: z.string().optional(),
});

const newBodyModEntry = z.object({
  type: z.enum(["piercing", "stretching", "branding", "scarification", "implant", "teeth", "jewelry", "other"]),
  bodyRegion: z.string().min(1),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  material: z.string().optional(),
  gauge: z.string().optional(),
  status: z.enum(["present", "removed", "overgrown", "modified"]).default("present"),
});

const cosmProcEventEntry = z.object({
  cosmeticProcedureId: z.string().min(1),
  eventType: z.enum(["performed", "revised", "reversed"]),
  notes: z.string().optional(),
});

const newCosmProcEntry = z.object({
  type: z.string().min(1),
  bodyRegion: z.string().min(1),
  description: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().default("completed"),
});

// ── Batch persona schema ─────────────────────────────────────────────────────

export const createPersonaBatchSchema = z.object({
  label: z.string().min(1, "Label is required"),
  date: z.string().optional(),
  datePrecision: z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN"),
  notes: z.string().optional(),

  // Physical changes (optional)
  currentHairColor: z.string().optional(),
  weight: z.coerce.number().positive().optional(),
  build: z.string().optional(),

  // Events for existing entities
  bodyMarkEvents: z.array(bodyMarkEventEntry).default([]),
  bodyModificationEvents: z.array(bodyModEventEntry).default([]),
  cosmeticProcedureEvents: z.array(cosmProcEventEntry).default([]),

  // New entities (created with initial event)
  newBodyMarks: z.array(newBodyMarkEntry).default([]),
  newBodyModifications: z.array(newBodyModEntry).default([]),
  newCosmeticProcedures: z.array(newCosmProcEntry).default([]),
});

export type CreatePersonaBatchInput = z.output<typeof createPersonaBatchSchema>;

// ── Update persona schema ────────────────────────────────────────────────────

export const updatePersonaSchema = z.object({
  label: z.string().min(1).optional(),
  date: z.string().optional(),
  datePrecision: z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).optional(),
  notes: z.string().optional(),
});

export type UpdatePersonaInput = z.output<typeof updatePersonaSchema>;
