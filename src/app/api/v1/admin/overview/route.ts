import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    return await verifyAdminToken(token);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const allowed = await requireAdmin(req);
  if (!allowed) return jsonError("UNAUTHORIZED", "Admin session required", 401);

  const rows = await pool.query(
    `
      SELECT
        b.tenant_id,
        b.name,
        b.slug,
        COALESCE(a.reserved_count, 0)::int AS reserved_count,
        COALESCE(sub.status::text, 'none') AS subscription_status,
        CASE
          WHEN sub.status = 'trialing' THEN 'trial'
          WHEN sub.status IN ('active', 'past_due', 'grace') THEN 'paga'
          ELSE 'sin_plan'
        END AS subscription_type,
        sub.current_period_end
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT count(*) AS reserved_count
        FROM appointments a
        WHERE a.tenant_id = b.tenant_id
          AND a.status = 'confirmed'
          AND a.deleted_at IS NULL
          AND a.start_at >= now()
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT s.status, s.current_period_end, s.updated_at, s.created_at
        FROM subscriptions s
        WHERE s.tenant_id = b.tenant_id
        ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
        LIMIT 1
      ) sub ON true
      WHERE b.deleted_at IS NULL
      ORDER BY b.created_at DESC
      LIMIT 500
    `,
  );

  return jsonOk({ businesses: rows.rows });
}
