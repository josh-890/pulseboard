import { z } from "zod";

export const updateResearchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required").max(200).optional(),
  content: z.string().max(50000).optional(),
});
