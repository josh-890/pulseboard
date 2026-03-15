import { z } from "zod";

export const createBodyMarkSchema = z.object({
  personId: z.string().min(1),
  type: z.enum(["tattoo", "scar", "mark", "burn", "deformity", "other"]),
  bodyRegion: z.string().min(1, "Body region is required"),
  bodyRegions: z.array(z.string()).default([]),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  motif: z.string().optional(),
  colors: z.array(z.string()).default([]),
  size: z.string().optional(),
  status: z.enum(["present", "modified", "removed"]).default("present"),
});

export type CreateBodyMarkInput = z.output<typeof createBodyMarkSchema>;

export const updateBodyMarkSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["tattoo", "scar", "mark", "burn", "deformity", "other"]).optional(),
  bodyRegion: z.string().min(1).optional(),
  bodyRegions: z.array(z.string()).optional(),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  motif: z.string().optional(),
  colors: z.array(z.string()).optional(),
  size: z.string().optional(),
  status: z.enum(["present", "modified", "removed"]).optional(),
});

export type UpdateBodyMarkInput = z.output<typeof updateBodyMarkSchema>;

export const createBodyMarkEventSchema = z.object({
  bodyMarkId: z.string().min(1),
  personaId: z.string().min(1),
  eventType: z.enum(["added", "modified", "removed"]),
  notes: z.string().optional(),
});

export type CreateBodyMarkEventInput = z.output<typeof createBodyMarkEventSchema>;
