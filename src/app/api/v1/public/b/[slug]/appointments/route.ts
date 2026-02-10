import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { createPublicAppointmentSchema } from "@/lib/schemas/appointments";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTenantSubscriptionStatus } from "@/lib/subscription";
import { sendWhatsAppBookingConfirmation } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`book:${ip}`, 10, 60_000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Too many booking attempts", 429);

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) return jsonError("VALIDATION_ERROR", "Missing Idempotency-Key header", 400);

  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createPublicAppointmentSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const business = await pool.query(
    `SELECT tenant_id, name, timezone, public_booking_enabled, block_public_on_billing_issue FROM businesses WHERE slug = $1 LIMIT 1`,
    [slug],
  );

  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  if (!business.rows[0].public_booking_enabled) return jsonError("FORBIDDEN", "Public booking disabled", 403);

  if (business.rows[0].block_public_on_billing_issue) {
    const billing = await getTenantSubscriptionStatus(business.rows[0].tenant_id);
    if (billing.effectiveAccess === "block") {
      return jsonError("FORBIDDEN", "Business is temporarily unavailable", 403);
    }
  }

  try {
    const startAt = new Date(parsed.data.start_at);

    const res = await pool.query(
      `
      SELECT * FROM create_appointment_atomic(
        p_tenant_id := $1::uuid,
        p_staff_user_id := $2::uuid,
        p_service_id := $3::uuid,
        p_start_at := $4::timestamptz,
        p_customer_name := $5::text,
        p_customer_phone := $6::text,
        p_customer_email := $7::citext,
        p_notes := $8::text,
        p_idempotency_key := $9::text
      )
      `,
      [
        business.rows[0].tenant_id,
        parsed.data.staff_user_id ?? null,
        parsed.data.service_id,
        startAt.toISOString(),
        parsed.data.customer_name,
        parsed.data.customer_phone ?? null,
        parsed.data.customer_email ?? null,
        parsed.data.notes ?? null,
        idempotencyKey,
      ],
    );

    const service = await pool.query("SELECT name FROM services WHERE id = $1 AND tenant_id = $2 LIMIT 1", [
      parsed.data.service_id,
      business.rows[0].tenant_id,
    ]);

    let whatsappConfig:
      | {
          enabled: boolean;
          phone_number_id: string | null;
          api_token: string | null;
        }
      | undefined;

    try {
      const waRes = await pool.query(
        `SELECT enabled, phone_number_id, api_token FROM business_whatsapp_settings WHERE tenant_id = $1 LIMIT 1`,
        [business.rows[0].tenant_id],
      );
      if (waRes.rowCount) {
        whatsappConfig = {
          enabled: Boolean(waRes.rows[0].enabled),
          phone_number_id: waRes.rows[0].phone_number_id ?? null,
          api_token: waRes.rows[0].api_token ?? null,
        };
      }
    } catch {
      // If WhatsApp settings table is missing or unavailable, do not block booking.
      whatsappConfig = undefined;
    }

    const whatsapp = await sendWhatsAppBookingConfirmation({
      toPhone: parsed.data.customer_phone,
      customerName: parsed.data.customer_name,
      businessName: business.rows[0].name,
      serviceName: service.rows[0]?.name ?? "Servicio",
      startAtIso: startAt.toISOString(),
      timezone: business.rows[0].timezone,
    },
    whatsappConfig
      ? {
          enabled: whatsappConfig.enabled,
          phoneNumberId: whatsappConfig.phone_number_id,
          apiToken: whatsappConfig.api_token,
        }
      : undefined,
    ).catch(() => ({ sent: false as const, reason: "whatsapp_send_failed" }));

    return jsonOk(
      {
        appointment_id: res.rows[0].appointment_id,
        status: "confirmed",
        scheduled_start_at: startAt.toISOString(),
        whatsapp_notification_sent: whatsapp?.sent ?? false,
        whatsapp_reason: whatsapp?.sent ? null : whatsapp?.reason ?? "unknown",
      },
      201,
    );
  } catch (error: unknown) {
    const dbError = error as { code?: string; message?: string };
    if (dbError.code === "P0002") return jsonError("NOT_FOUND", "Service not found", 404);
    if (dbError.code === "P0001") return jsonError("VALIDATION_ERROR", dbError.message ?? "Validation error", 400);
    if (dbError.code === "23P01") return jsonError("SLOT_TAKEN", "Selected slot is no longer available", 409);
    return jsonError("INTERNAL_ERROR", "Could not create appointment", 500);
  }
}
