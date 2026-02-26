import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");

export const updateSetSchema = z.object({
  id: z.string().min(1),
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

export const createSetStandaloneSchema = z.object({
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

export const creditEntrySchema = z.object({
  role: z.enum(["MODEL", "PHOTOGRAPHER"]),
  rawName: z.string().min(1, "Name is required"),
  resolvedPersonId: z.string().optional(),
});

export const labelEvidenceEntrySchema = z.object({
  labelId: z.string().min(1),
  evidenceType: z.enum(["CHANNEL_MAP", "MANUAL"]),
  confidence: z.number().min(0).max(1).default(1.0),
});

export type UpdateSetFormValues = z.input<typeof updateSetSchema>;
export type UpdateSetInput = z.output<typeof updateSetSchema>;
export type CreateSetStandaloneFormValues = z.input<typeof createSetStandaloneSchema>;
export type CreateSetStandaloneInput = z.output<typeof createSetStandaloneSchema>;
export type CreditEntry = z.output<typeof creditEntrySchema>;
export type LabelEvidenceEntry = z.output<typeof labelEvidenceEntrySchema>;
