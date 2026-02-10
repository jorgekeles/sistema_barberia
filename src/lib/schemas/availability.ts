import { z } from "zod";

export const slotsQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  service_id: z.string().uuid(),
  staff_user_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
