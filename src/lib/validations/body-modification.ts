import { z } from "zod";

export const createBodyModificationSchema = z.object({
  personId: z.string().min(1),
  type: z.enum(["piercing", "stretching", "branding", "scarification", "implant", "teeth", "jewelry", "other"]),
  bodyRegion: z.string().min(1, "Body region is required"),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  material: z.string().optional(),
  gauge: z.string().optional(),
  status: z.enum(["present", "removed", "overgrown", "modified"]).default("present"),
});

export type CreateBodyModificationInput = z.output<typeof createBodyModificationSchema>;

export const updateBodyModificationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["piercing", "stretching", "branding", "scarification", "implant", "teeth", "jewelry", "other"]).optional(),
  bodyRegion: z.string().min(1).optional(),
  side: z.string().optional(),
  position: z.string().optional(),
  description: z.string().optional(),
  material: z.string().optional(),
  gauge: z.string().optional(),
  status: z.enum(["present", "removed", "overgrown", "modified"]).optional(),
});

export type UpdateBodyModificationInput = z.output<typeof updateBodyModificationSchema>;

export const createBodyModificationEventSchema = z.object({
  bodyModificationId: z.string().min(1),
  personaId: z.string().min(1),
  eventType: z.enum(["added", "modified", "removed"]),
  notes: z.string().optional(),
});

export type CreateBodyModificationEventInput = z.output<typeof createBodyModificationEventSchema>;
