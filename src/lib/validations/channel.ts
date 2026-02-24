import { z } from "zod";

export const createChannelSchema = z.object({
  labelId: z.string().min(1, "Label is required"),
  name: z.string().min(1, "Name is required"),
  platform: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export const updateChannelSchema = z.object({
  id: z.string().min(1),
  labelId: z.string().min(1, "Label is required"),
  name: z.string().min(1, "Name is required"),
  platform: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export type CreateChannelFormValues = z.input<typeof createChannelSchema>;
export type CreateChannelInput = z.output<typeof createChannelSchema>;
export type UpdateChannelFormValues = z.input<typeof updateChannelSchema>;
export type UpdateChannelInput = z.output<typeof updateChannelSchema>;
