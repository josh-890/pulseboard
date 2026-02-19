import { z } from "zod";

export const createLabelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export const updateLabelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export type CreateLabelFormValues = z.input<typeof createLabelSchema>;
export type CreateLabelInput = z.output<typeof createLabelSchema>;
export type UpdateLabelFormValues = z.input<typeof updateLabelSchema>;
export type UpdateLabelInput = z.output<typeof updateLabelSchema>;
