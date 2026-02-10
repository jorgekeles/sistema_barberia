import { NextRequest } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const manageSchema = z.object({
  action: z.enum(["cancel", "reschedule"]),
  appointment_id: z.string().uuid().optional(),
  scheduled_start_at: z.string().datetime({ offset: true }).optional(),
  customer_phone: z.string().min(8).max(32),
  new_start_at: z.string().datetime({ offset: true }).optional(),
}).refine((v) => Boolean(v.appointment_id || v.scheduled_start_at), {
  message: "appointment_id or scheduled_start_at is required",
});

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = manageSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const business = await pool.query("SELECT tenant_id FROM businesses WHERE slug = $1 LIMIT 1", [slug]);
  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  const tenantId = business.rows[0].tenant_id as string;

  const appt = await pool.query(
    `
      SELECT a.id, a.customer_phone, a.service_id, a.staff_user_id, a.status
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      AND a.deleted_at IS NULL
      AND (
        ($2::uuid IS NOT NULL AND a.id = $2::uuid)
        OR (
          $3::timestamptz IS NOT NULL
          AND a.start_at + make_interval(mins => COALESCE(s.buffer_before_min, 0)) = $3::timestamptz
        )
      )
      ORDER BY a.created_at DESC
      LIMIT 1
    `,
    [tenantId, parsed.data.appointment_id ?? null, parsed.data.scheduled_start_at ?? null],
  );

  if (!appt.rowCount) return jsonError("NOT_FOUND", "Appointment not found", 404);
  if (appt.rows[0].status !== "confirmed") return jsonError("VALIDATION_ERROR", "Appointment is not active", 400);

  const requestPhone = normalizePhone(parsed.data.customer_phone);
  const storedPhone = normalizePhone(appt.rows[0].customer_phone ?? "");
  if (!requestPhone || requestPhone !== storedPhone) {
    return jsonError("FORBIDDEN", "Phone does not match appointment", 403);
  }

  if (parsed.data.action === "cancel") {
    const canceled = await pool.query(
      `
        UPDATE appointments
        SET status = 'canceled', canceled_at = now(), updated_at = now()
        WHERE id = $1
        AND tenant_id = $2
        AND status = 'confirmed'
        RETURNING id, status, canceled_at
      `,
      [appt.rows[0].id, tenantId],
    );

    if (!canceled.rowCount) return jsonError("NOT_FOUND", "Appointment not found", 404);
    return jsonOk({ appointment_id: canceled.rows[0].id, status: canceled.rows[0].status, canceled_at: canceled.rows[0].canceled_at });
  }

  if (!parsed.data.new_start_at) {
    return jsonError("VALIDATION_ERROR", "new_start_at is required for reschedule", 400);
  }

  const svc = await pool.query(
    `
      SELECT duration_min, buffer_before_min, buffer_after_min
      FROM services
      WHERE id = $1
      AND tenant_id = $2
      LIMIT 1
    `,
    [appt.rows[0].service_id, tenantId],
  );

  if (!svc.rowCount) return jsonError("NOT_FOUND", "Service not found", 404);

  const durationMin = Number(svc.rows[0].duration_min);
  const bufferBefore = Number(svc.rows[0].buffer_before_min ?? 0);
  const bufferAfter = Number(svc.rows[0].buffer_after_min ?? 0);

  const serviceStart = new Date(parsed.data.new_start_at);
  const storedStart = new Date(serviceStart.getTime() - bufferBefore * 60_000);
  const storedEnd = new Date(serviceStart.getTime() + (durationMin + bufferAfter) * 60_000);

  try {
    const updated = await pool.query(
      `
        UPDATE appointments
        SET start_at = $1::timestamptz,
            end_at = $2::timestamptz,
            updated_at = now()
        WHERE id = $3
        AND tenant_id = $4
        AND status = 'confirmed'
        RETURNING id, status, start_at, end_at
      `,
      [storedStart.toISOString(), storedEnd.toISOString(), appt.rows[0].id, tenantId],
    );

    return jsonOk({
      appointment_id: updated.rows[0].id,
      status: updated.rows[0].status,
      start_at: updated.rows[0].start_at,
      end_at: updated.rows[0].end_at,
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError.code === "23P01") {
      return jsonError("SLOT_TAKEN", "Selected slot is no longer available", 409);
    }
    return jsonError("INTERNAL_ERROR", "Could not reschedule appointment", 500);
  }
}
