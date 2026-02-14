import { z } from "zod";

export const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#e11d48",
  "#7c3aed",
  "#0ea5e9",
] as const;

export const personFormSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or fewer"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or fewer"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  avatarColor: z.string().min(1, "Avatar color is required"),
});

export type PersonFormValues = z.infer<typeof personFormSchema>;
