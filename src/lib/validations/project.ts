import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  tags: z.array(z.string()).default([]),
});

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  tags: z.array(z.string()).default([]),
});

export type CreateProjectFormValues = z.input<typeof createProjectSchema>;
export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectFormValues = z.input<typeof updateProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
