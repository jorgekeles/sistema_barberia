import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(20),
});
