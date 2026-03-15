import { z } from "zod";

export const createCosmeticProcedureSchema = z.object({
  personId: z.string().min(1),
  type: z.string().min(1, "Procedure type is required"),
  bodyRegion: z.string().min(1, "Body region is required"),
  bodyRegions: z.array(z.string()).default([]),
  description: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().default("completed"),
});

export type CreateCosmeticProcedureInput = z.output<typeof createCosmeticProcedureSchema>;

export const updateCosmeticProcedureSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1).optional(),
  bodyRegion: z.string().min(1).optional(),
  bodyRegions: z.array(z.string()).optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().optional(),
});

export type UpdateCosmeticProcedureInput = z.output<typeof updateCosmeticProcedureSchema>;

export const createCosmeticProcedureEventSchema = z.object({
  cosmeticProcedureId: z.string().min(1),
  personaId: z.string().min(1),
  eventType: z.enum(["performed", "revised", "reversed"]),
  notes: z.string().optional(),
});

export type CreateCosmeticProcedureEventInput = z.output<typeof createCosmeticProcedureEventSchema>;
