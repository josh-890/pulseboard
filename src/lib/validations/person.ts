import { z } from "zod";

export const createPersonSchema = z.object({
  // Required
  icgId: z
    .string()
    .min(1, "ICG-ID is required")
    .regex(
      /^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$/,
      'Format: XX-00XXX  e.g. JD-96ABF',
    ),
  commonName: z.string().min(1, "Display name is required"),
  // Status
  status: z.enum(["active", "inactive", "wishlist", "archived"]).default("active"),
  // Names
  birthName: z.string().optional(),
  // Origin
  sexAtBirth: z.enum(["male", "female"]).optional(),
  birthdate: z.string().optional(),
  birthPlace: z.string().optional(),
  nationality: z.string().max(3).optional(),
  ethnicity: z.string().optional(),
  // Physical (static)
  eyeColor: z.string().optional(),
  naturalHairColor: z.string().optional(),
  height: z.coerce.number().int().positive().optional(),
  // Baseline persona
  personaLabel: z.string().min(1, "Persona label is required").default("Baseline"),
  weight: z.coerce.number().positive().optional(),
  build: z.string().optional(),
  currentHairColor: z.string().optional(),
  visionAids: z.string().optional(),
  fitnessLevel: z.string().optional(),
});

// Input type (form values — defaults may be undefined before zod applies them)
export type CreatePersonFormValues = z.input<typeof createPersonSchema>;
// Output type (after zod defaults are applied — used by server action)
export type CreatePersonInput = z.output<typeof createPersonSchema>;

export const updatePersonSchema = z.object({
  id: z.string().min(1),
  commonName: z.string().min(1, "Display name is required"),
  status: z.enum(["active", "inactive", "wishlist", "archived"]).default("active"),
  birthName: z.string().optional(),
  sexAtBirth: z.enum(["male", "female"]).optional(),
  birthdate: z.string().optional(),
  birthPlace: z.string().optional(),
  nationality: z.string().max(3).optional(),
  ethnicity: z.string().optional(),
  eyeColor: z.string().optional(),
  naturalHairColor: z.string().optional(),
  height: z.coerce.number().int().positive().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  activeSince: z.coerce.number().int().positive().optional(),
  specialization: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  pgrade: z.coerce.number().int().min(1).max(10).optional(),
  weight: z.coerce.number().positive().optional(),
  build: z.string().optional(),
  currentHairColor: z.string().optional(),
  visionAids: z.string().optional(),
  fitnessLevel: z.string().optional(),
});

export type UpdatePersonFormValues = z.input<typeof updatePersonSchema>;
export type UpdatePersonInput = z.output<typeof updatePersonSchema>;
