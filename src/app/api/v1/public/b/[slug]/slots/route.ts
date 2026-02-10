import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { computePublicSlots } from "@/lib/availability";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { slotsQuerySchema } from "@/lib/schemas/availability";
import { getTenantSubscriptionStatus } from "@/lib/subscription";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`slots:${ip}`, 120, 60_000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Too many requests", 429);

  const { slug } = await params;
  const parsed = slotsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const business = await pool.query(
    "SELECT tenant_id, public_booking_enabled, block_public_on_billing_issue FROM businesses WHERE slug = $1 LIMIT 1",
    [slug],
  );
  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  if (!business.rows[0].public_booking_enabled) return jsonError("FORBIDDEN", "Public booking disabled", 403);
  if (business.rows[0].block_public_on_billing_issue) {
    const billing = await getTenantSubscriptionStatus(business.rows[0].tenant_id);
    if (billing.effectiveAccess === "block") {
      return jsonOk({ timezone: "UTC", slots: [] });
    }
  }

  const rows = await computePublicSlots({
    slug,
    from: parsed.data.from,
    to: parsed.data.to,
    serviceId: parsed.data.service_id,
    staffUserId: parsed.data.staff_user_id,
    limit: parsed.data.limit,
  });

  return jsonOk({ timezone: rows[0]?.timezone ?? "UTC", slots: rows });
}
