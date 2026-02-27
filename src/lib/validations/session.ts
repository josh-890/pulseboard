import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");

export const createSessionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  projectId: z.string().optional(),
  labelId: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["DRAFT", "CONFIRMED"]).default("DRAFT"),
  notes: z.string().optional(),
  date: z.string().optional(),
  datePrecision: datePrecisionEnum,
});

export const updateSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  projectId: z.string().nullable().optional(),
  labelId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "CONFIRMED"]).optional(),
  notes: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  datePrecision: datePrecisionEnum,
});

export type CreateSessionFormValues = z.input<typeof createSessionSchema>;
export type CreateSessionInput = z.output<typeof createSessionSchema>;
export type UpdateSessionFormValues = z.input<typeof updateSessionSchema>;
export type UpdateSessionInput = z.output<typeof updateSessionSchema>;
