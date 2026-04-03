import { z } from "zod";

export const recordPhysicalChangeSchema = z
  .object({
    personId: z.string().min(1),
    date: z.string().optional(),
    datePrecision: z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN"),
    currentHairColor: z.string().optional(),
    weight: z.coerce.number().positive().optional(),
    build: z.string().optional(),
    breastSize: z.string().optional(),
    breastStatus: z.string().optional(),
    breastDescription: z.string().optional(),
  })
  .refine(
    (data) =>
      data.currentHairColor ||
      data.weight !== undefined ||
      data.build ||
      data.breastSize ||
      data.breastStatus ||
      data.breastDescription,
    { message: "At least one physical field is required." },
  );

export type RecordPhysicalChangeInput = z.output<typeof recordPhysicalChangeSchema>;
