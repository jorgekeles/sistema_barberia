import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`lookup:${ip}`, 20, 60_000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Too many lookup attempts", 429);

  const { slug } = await params;
  const rawPhone = req.nextUrl.searchParams.get("phone") ?? "";
  const normalized = normalizePhone(rawPhone);
  if (normalized.length < 8) return jsonError("VALIDATION_ERROR", "Phone is required", 400);

  const business = await pool.query(
    `
      SELECT tenant_id
      FROM businesses
      WHERE slug = $1
      AND deleted_at IS NULL
      LIMIT 1
    `,
    [slug],
  );

  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  const tenantId = business.rows[0].tenant_id as string;

  const appts = await pool.query(
    `
      SELECT
        a.id AS appointment_id,
        a.service_id,
        a.staff_user_id,
        a.status,
        a.start_at + make_interval(mins => COALESCE(s.buffer_before_min, 0)) AS scheduled_start_at,
        COALESCE(s.name, 'Servicio') AS service_name,
        u.full_name AS staff_name
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      LEFT JOIN users u ON u.id = a.staff_user_id
      WHERE a.tenant_id = $1
      AND a.deleted_at IS NULL
      AND a.status = 'confirmed'
      AND regexp_replace(COALESCE(a.customer_phone, ''), '[^0-9]', '', 'g') = $2
      AND a.end_at >= now() - interval '2 hours'
      ORDER BY scheduled_start_at ASC
      LIMIT 20
    `,
    [tenantId, normalized],
  );

  return jsonOk({ appointments: appts.rows });
}
