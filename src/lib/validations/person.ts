import { z } from "zod";

const datePrecisionEnum = z.enum(["UNKNOWN", "YEAR", "MONTH", "DAY"]).default("UNKNOWN");
const dateModifierEnum = z.enum(["EXACT", "APPROXIMATE", "ESTIMATED", "BEFORE", "AFTER"]).default("EXACT");

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
  birthdatePrecision: datePrecisionEnum,
  birthdateModifier: dateModifierEnum,
  birthdateSource: z.string().optional(),
  birthPlace: z.string().optional(),
  nationality: z.string().length(3).regex(/^[A-Z]{3}$/, "Must be a valid 3-letter IOC country code").optional().or(z.literal("")),
  // Phase G Slice 16C T3: Ethnicity split into Broad SINGLE_SELECT +
  // Specific TEXT, both written as ScalarDeltas on baseline Era. The
  // legacy `ethnicity` combined field is removed (was: `z.string().optional()`).
  ethnicityBroad: z.string().optional(),
  ethnicitySpecific: z.string().optional(),
  // Static physical
  eyeColor: z.string().optional(),
  height: z.coerce.number().int().positive().optional(),
  // Baseline era physical (ScalarDeltas)
  weight: z.coerce.number().positive().optional(),
  build: z.string().optional(),
  currentHairColor: z.string().optional(),
  breastSize: z.string().optional(),
  breastDescription: z.string().optional(),
  // Raw measurements string (e.g. "35-23-34 / ~89-58-86"). Written to the
  // cattr-measurements baseline ScalarDelta verbatim — no parsing into
  // Bust/Waist/Hips per ADR-0008 (low-stakes TEXT pass-through).
  measurements: z.string().optional(),
  hairLength: z.string().optional(),
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
  birthdatePrecision: datePrecisionEnum,
  birthdateModifier: dateModifierEnum,
  birthdateSource: z.string().optional(),
  // Slice 16 follow-up: verified-unknown flag for Birthday/Nationality.
  // True = user explicitly confirmed there's no value; the audit
  // distinguishes this from "haven't checked yet" (null+false).
  birthdateUnknown: z.boolean().optional(),
  birthPlace: z.string().optional(),
  nationality: z.string().length(3).regex(/^[A-Z]{3}$/, "Must be a valid 3-letter IOC country code").optional().or(z.literal("")),
  nationalityUnknown: z.boolean().optional(),
  // Phase G Slice 16C T3: same split as createPersonSchema.
  ethnicityBroad: z.string().optional(),
  ethnicitySpecific: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  activeFrom: z.string().optional(),
  activeFromPrecision: datePrecisionEnum,
  activeFromModifier: dateModifierEnum,
  activeFromSource: z.string().optional(),
  retiredAt: z.string().optional(),
  retiredAtPrecision: datePrecisionEnum,
  retiredAtModifier: dateModifierEnum,
  retiredAtSource: z.string().optional(),
  specialization: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  pgrade: z.coerce.number().int().min(1).max(10).optional(),
  // Claimed catalogue size from the biography. Covers is derived, not stored.
  // The form's onChange sends undefined for an empty input (mirrors `height`),
  // so coerce.number().optional() never sees ""; a change flips claimedStatsUserSet.
  claimedPhotosets: z.coerce.number().int().min(0).optional(),
  claimedVideos: z.coerce.number().int().min(0).optional(),
  // Free-text provenance for the claimed figures (e.g. "THENUDE bio 2024").
  claimedStatsNote: z.string().optional(),
  // Watchlist: monitor for new sets to import (orthogonal to status).
  watching: z.boolean().optional(),
  watchPriority: z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
  watchNote: z.string().optional(),
  watchSourceUrl: z.string().optional(),
});

export type UpdatePersonFormValues = z.input<typeof updatePersonSchema>;
export type UpdatePersonInput = z.output<typeof updatePersonSchema>;

export const icgIdChangeSchema = z.object({
  id: z.string().min(1),
  icgId: z
    .string()
    .min(1, "ICG-ID is required")
    .regex(/^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$/, 'Format: XX-00XXX  e.g. JD-96ABF'),
});
export type IcgIdChangeInput = z.infer<typeof icgIdChangeSchema>;

export const updateAppearanceSchema = z.object({
  id: z.string().min(1),
  eyeColor: z.string().optional(),
  measurements: z.string().optional(),
  height: z.coerce.number().int().positive().optional(),
  weight: z.coerce.number().positive().optional(),
  build: z.string().optional(),
  currentHairColor: z.string().optional(),
  breastSize: z.string().optional(),
  // Slice 16 follow-up: verified-unknown flags. True = explicitly mark
  // the attribute as unknown; the action writes a ScalarDelta with
  // isVerifiedUnknown=true and value="". Measurements is Tier 2; no flag.
  eyeColorUnknown: z.boolean().optional(),
  hairColorUnknown: z.boolean().optional(),
  weightUnknown: z.boolean().optional(),
  heightUnknown: z.boolean().optional(),
  buildUnknown: z.boolean().optional(),
  breastSizeUnknown: z.boolean().optional(),
});
export type UpdateAppearanceFormValues = z.input<typeof updateAppearanceSchema>;
export type UpdateAppearanceInput = z.output<typeof updateAppearanceSchema>;
