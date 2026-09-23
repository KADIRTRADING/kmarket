import { z } from "zod";

export const loginSchema = z.object({
  // A store user logs in with phone; platform staff log in with email.
  phone: z.string().min(5).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6),
}).refine((v) => Boolean(v.phone) || Boolean(v.email), {
  message: "Provide either phone or email",
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
