import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const period = req.nextUrl.searchParams.get("period") === "monthly" ? "monthly" : "weekly";
  const trunc = period === "monthly" ? "month" : "week";

  const total = await pool.query(
    `
      SELECT
        date_trunc('${trunc}', now()) AS period_start,
        date_trunc('${trunc}', now()) + interval '1 ${period === "monthly" ? "month" : "week"}' AS period_end,
        COUNT(*)::int AS total_appointments,
        COALESCE(SUM(COALESCE(s.price_amount_cents, 0)), 0)::bigint AS total_revenue_cents,
        COALESCE(MAX(s.price_currency), 'ARS') AS currency
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      AND a.status = 'confirmed'
      AND a.deleted_at IS NULL
      AND a.end_at < now()
      AND a.end_at >= date_trunc('${trunc}', now())
      AND a.end_at < date_trunc('${trunc}', now()) + interval '1 ${period === "monthly" ? "month" : "week"}'
    `,
    [auth.tenantId],
  );

  const byService = await pool.query(
    `
      SELECT
        COALESCE(s.name, 'Servicio eliminado') AS service_name,
        COUNT(*)::int AS appointments,
        COALESCE(SUM(COALESCE(s.price_amount_cents, 0)), 0)::bigint AS revenue_cents,
        COALESCE(MAX(s.price_currency), 'ARS') AS currency
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      AND a.status = 'confirmed'
      AND a.deleted_at IS NULL
      AND a.end_at < now()
      AND a.end_at >= date_trunc('${trunc}', now())
      AND a.end_at < date_trunc('${trunc}', now()) + interval '1 ${period === "monthly" ? "month" : "week"}'
      GROUP BY COALESCE(s.name, 'Servicio eliminado')
      ORDER BY revenue_cents DESC, appointments DESC
    `,
    [auth.tenantId],
  );

  return jsonOk({
    period,
    period_start: total.rows[0]?.period_start,
    period_end: total.rows[0]?.period_end,
    total_appointments: Number(total.rows[0]?.total_appointments ?? 0),
    total_revenue_cents: Number(total.rows[0]?.total_revenue_cents ?? 0),
    currency: total.rows[0]?.currency ?? "ARS",
    by_service: byService.rows,
  });
}
