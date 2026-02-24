import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");

export const createPersonInterestSchema = z.object({
  personId: z.string().min(1),
  name: z.string().min(1, "Interest name is required"),
  category: z.string().optional(),
  level: z.string().optional(),
  validFrom: z.string().optional(),
  validFromPrecision: datePrecisionEnum,
  validTo: z.string().optional(),
  validToPrecision: datePrecisionEnum,
  notes: z.string().optional(),
});

export type CreatePersonInterestInput = z.output<typeof createPersonInterestSchema>;

export const updatePersonInterestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  validFrom: z.string().optional(),
  validFromPrecision: datePrecisionEnum,
  validTo: z.string().optional(),
  validToPrecision: datePrecisionEnum,
  notes: z.string().optional(),
});

export type UpdatePersonInterestInput = z.output<typeof updatePersonInterestSchema>;
