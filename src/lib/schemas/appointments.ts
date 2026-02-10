import { z } from "zod";

export const createPublicAppointmentSchema = z.object({
  service_id: z.string().uuid(),
  staff_user_id: z.string().uuid().optional(),
  start_at: z.string().datetime({ offset: true }),
  customer_name: z.string().min(2).max(120),
  customer_phone: z
    .string()
    .min(8)
    .max(32)
    .regex(/^[+0-9()\-\s]+$/, "Telefono invalido"),
  customer_email: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().min(2).max(240),
});
