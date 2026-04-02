import { z } from "zod";

export const createDigitalIdentitySchema = z.object({
  personId: z.string().min(1),
  platform: z.string().min(1, "Platform is required"),
  handle: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended", "deleted"]).default("active"),
});

export type CreateDigitalIdentityInput = z.output<typeof createDigitalIdentitySchema>;

export const updateDigitalIdentitySchema = z.object({
  id: z.string().min(1),
  platform: z.string().min(1, "Platform is required").optional(),
  handle: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended", "deleted"]).optional(),
});

export type UpdateDigitalIdentityInput = z.output<typeof updateDigitalIdentitySchema>;
