import { z } from "zod";

const channelTierValues = ['PREMIUM', 'HIGH', 'NORMAL', 'LOW', 'TRASH'] as const;

export const createChannelSchema = z.object({
  labelId: z.string().min(1, "Label is required"),
  name: z.string().min(1, "Name is required"),
  shortName: z.string().optional(),
  channelFolder: z.string().optional(),
  platform: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  tier: z.enum(channelTierValues).optional(),
});

export const updateChannelSchema = z.object({
  id: z.string().min(1),
  labelId: z.string().min(1, "Label is required"),
  name: z.string().min(1, "Name is required"),
  shortName: z.string().optional(),
  channelFolder: z.string().optional(),
  platform: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  tier: z.enum(channelTierValues).optional(),
});

export type CreateChannelFormValues = z.input<typeof createChannelSchema>;
export type CreateChannelInput = z.output<typeof createChannelSchema>;
export type UpdateChannelFormValues = z.input<typeof updateChannelSchema>;
export type UpdateChannelInput = z.output<typeof updateChannelSchema>;
