import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const exceptionSchema = z.object({
  staff_user_id: z.string().uuid().nullable().optional(),
  exception_date: z.string().date(),
  kind: z.enum(["closed_full_day", "closed_partial", "open_special", "manual_block"]),
  start_local: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_local: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(200).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const from = req.nextUrl.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to") ?? new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);

  const result = await pool.query(
    `SELECT * FROM availability_exceptions WHERE tenant_id = $1 AND exception_date BETWEEN $2::date AND $3::date ORDER BY exception_date, priority DESC`,
    [auth.tenantId, from, to],
  );

  return jsonOk({ exceptions: result.rows });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = exceptionSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const row = await pool.query(
    `
      INSERT INTO availability_exceptions (tenant_id, staff_user_id, exception_date, kind, start_local, end_local, reason, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      auth.tenantId,
      parsed.data.staff_user_id ?? null,
      parsed.data.exception_date,
      parsed.data.kind,
      parsed.data.start_local ?? null,
      parsed.data.end_local ?? null,
      parsed.data.reason ?? null,
      parsed.data.priority,
    ],
  );

  await pool.query("UPDATE businesses SET schedule_version = schedule_version + 1, updated_at = now() WHERE tenant_id = $1", [
    auth.tenantId,
  ]);

  return jsonOk(row.rows[0], 201);
}
