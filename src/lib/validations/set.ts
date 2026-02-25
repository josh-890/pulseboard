import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");

export const createSetSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  type: z.enum(["photo", "video"], { error: "Type is required" }),
  title: z.string().min(1, "Title is required"),
  channelId: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: datePrecisionEnum,
  category: z.string().optional(),
  genre: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const updateSetSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1, "Session is required"),
  title: z.string().min(1, "Title is required"),
  channelId: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: datePrecisionEnum,
  category: z.string().optional(),
  genre: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

// Flow A — standalone: auto-creates project + session from set data
export const createSetWithContextSchema = z.object({
  channelId: z.string().min(1, "Channel is required"),
  type: z.enum(["photo", "video"], { error: "Type is required" }),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: datePrecisionEnum,
  category: z.string().optional(),
  genre: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

// Flow B — in-session: set belongs to a known session
export const createSetForSessionSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  projectId: z.string().min(1),
  channelId: z.string().optional(),
  newChannel: z
    .object({
      name: z.string().min(1, "Channel name is required"),
      platform: z.string().optional(),
      labelId: z.string().min(1),
    })
    .optional(),
  type: z.enum(["photo", "video"], { error: "Type is required" }),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseDatePrecision: datePrecisionEnum,
  category: z.string().optional(),
  genre: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const contributionItemSchema = z.object({
  personId: z.string().min(1),
  role: z.enum(["main", "supporting", "background"]),
});

export type CreateSetFormValues = z.input<typeof createSetSchema>;
export type CreateSetInput = z.output<typeof createSetSchema>;
export type UpdateSetFormValues = z.input<typeof updateSetSchema>;
export type UpdateSetInput = z.output<typeof updateSetSchema>;
export type CreateSetWithContextFormValues = z.input<typeof createSetWithContextSchema>;
export type CreateSetWithContextInput = z.output<typeof createSetWithContextSchema>;
export type CreateSetForSessionFormValues = z.input<typeof createSetForSessionSchema>;
export type CreateSetForSessionInput = z.output<typeof createSetForSessionSchema>;
export type ContributionItem = z.output<typeof contributionItemSchema>;
