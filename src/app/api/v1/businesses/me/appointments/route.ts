import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const from = req.nextUrl.searchParams.get("from") ?? new Date().toISOString();
  const to = req.nextUrl.searchParams.get("to") ?? new Date(Date.now() + 30 * 86400_000).toISOString();
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam && ["confirmed", "canceled", "no_show"].includes(statusParam) ? statusParam : "confirmed";

  const result = await pool.query(
    `
      SELECT
        a.id,
        a.staff_user_id,
        a.service_id,
        COALESCE(s.name, 'Servicio eliminado') AS service_name,
        a.customer_name,
        a.customer_phone,
        a.customer_email,
        a.start_at,
        a.end_at,
        a.status,
        a.source,
        a.created_at
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      AND a.start_at >= $2::timestamptz
      AND a.start_at < $3::timestamptz
      AND a.status = $4::appointment_status
      AND a.deleted_at IS NULL
      ORDER BY a.start_at ASC
      LIMIT 500
    `,
    [auth.tenantId, from, to, status],
  );

  return jsonOk({ appointments: result.rows });
}
