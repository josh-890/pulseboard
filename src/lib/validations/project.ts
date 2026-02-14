import { z } from "zod";

export const projectFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Description must be 500 characters or fewer"),
  status: z.enum(["active", "paused", "done"], {
    message: "Status is required",
  }),
  tags: z
    .array(z.string())
    .max(10, "Maximum 10 tags allowed"),
  stakeholderId: z.string().min(1, "Stakeholder is required"),
  leadId: z.string().min(1, "Lead is required"),
  memberIds: z.array(z.string()),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
