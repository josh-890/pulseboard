import { z } from "zod";

export const createArtistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nationality: z.string().optional(),
  bio: z.string().optional(),
});

export const updateArtistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  nationality: z.string().optional(),
  bio: z.string().optional(),
});
