import { z } from "zod";

export const personaFormSchema = z.object({
  effectiveDate: z.string().min(1, "Effective date is required"),
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  traits: z
    .array(
      z.object({
        traitCategoryId: z.string().min(1, "Category is required"),
        name: z.string().min(1, "Trait name is required"),
        action: z.enum(["add", "remove"]),
      }),
    )
    .optional(),
});

export type PersonaFormValues = z.infer<typeof personaFormSchema>;
