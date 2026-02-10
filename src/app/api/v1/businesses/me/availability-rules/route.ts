import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const ruleSchema = z.object({
  staff_user_id: z.string().uuid().nullable().optional(),
  day_of_week: z.number().int().min(0).max(6),
  start_local: z.string().regex(/^\d{2}:\d{2}$/),
  end_local: z.string().regex(/^\d{2}:\d{2}$/),
  slot_step_min: z.number().int().min(5).max(60).default(15),
  valid_from: z.string().date().optional(),
  valid_to: z.string().date().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const result = await pool.query(
    `SELECT * FROM availability_rules WHERE tenant_id = $1 AND is_active = true ORDER BY day_of_week, start_local`,
    [auth.tenantId],
  );
  return jsonOk({ rules: result.rows });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const row = await pool.query(
    `
      INSERT INTO availability_rules (tenant_id, staff_user_id, day_of_week, start_local, end_local, slot_step_min, valid_from, valid_to)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8)
      RETURNING *
    `,
    [
      auth.tenantId,
      parsed.data.staff_user_id ?? null,
      parsed.data.day_of_week,
      parsed.data.start_local,
      parsed.data.end_local,
      parsed.data.slot_step_min,
      parsed.data.valid_from ?? null,
      parsed.data.valid_to ?? null,
    ],
  );

  await pool.query("UPDATE businesses SET schedule_version = schedule_version + 1, updated_at = now() WHERE tenant_id = $1", [
    auth.tenantId,
  ]);

  return jsonOk(row.rows[0], 201);
}
