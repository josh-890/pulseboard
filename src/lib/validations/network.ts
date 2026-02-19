import { z } from "zod";

export const createNetworkSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export const updateNetworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export type CreateNetworkFormValues = z.input<typeof createNetworkSchema>;
export type CreateNetworkInput = z.output<typeof createNetworkSchema>;
export type UpdateNetworkFormValues = z.input<typeof updateNetworkSchema>;
export type UpdateNetworkInput = z.output<typeof updateNetworkSchema>;
