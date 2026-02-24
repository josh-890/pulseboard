import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");

export const createPersonEducationSchema = z.object({
  personId: z.string().min(1),
  type: z.enum(["primary", "secondary", "undergraduate", "graduate", "postgraduate", "vocational", "continuing", "other"]),
  institution: z.string().min(1, "Institution is required"),
  field: z.string().optional(),
  degree: z.string().optional(),
  startDate: z.string().optional(),
  startDatePrecision: datePrecisionEnum,
  endDate: z.string().optional(),
  endDatePrecision: datePrecisionEnum,
  notes: z.string().optional(),
});

export type CreatePersonEducationInput = z.output<typeof createPersonEducationSchema>;

export const updatePersonEducationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["primary", "secondary", "undergraduate", "graduate", "postgraduate", "vocational", "continuing", "other"]).optional(),
  institution: z.string().min(1).optional(),
  field: z.string().optional(),
  degree: z.string().optional(),
  startDate: z.string().optional(),
  startDatePrecision: datePrecisionEnum,
  endDate: z.string().optional(),
  endDatePrecision: datePrecisionEnum,
  notes: z.string().optional(),
});

export type UpdatePersonEducationInput = z.output<typeof updatePersonEducationSchema>;

export const createPersonAwardSchema = z.object({
  personId: z.string().min(1),
  type: z.enum(["degree", "certificate", "license", "award", "honor", "other"]),
  name: z.string().min(1, "Award name is required"),
  issuer: z.string().optional(),
  date: z.string().optional(),
  datePrecision: datePrecisionEnum,
  context: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
});

export type CreatePersonAwardInput = z.output<typeof createPersonAwardSchema>;

export const updatePersonAwardSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["degree", "certificate", "license", "award", "honor", "other"]).optional(),
  name: z.string().min(1).optional(),
  issuer: z.string().optional(),
  date: z.string().optional(),
  datePrecision: datePrecisionEnum,
  context: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
});

export type UpdatePersonAwardInput = z.output<typeof updatePersonAwardSchema>;
