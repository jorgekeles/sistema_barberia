import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getTenantSubscriptionStatus } from "@/lib/subscription";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const business = await pool.query(
    `
      SELECT tenant_id, name, slug, timezone, public_booking_enabled, block_public_on_billing_issue
      FROM businesses
      WHERE slug = $1
      AND deleted_at IS NULL
      LIMIT 1
    `,
    [slug],
  );

  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);

  const b = business.rows[0];
  if (!b.public_booking_enabled) return jsonError("FORBIDDEN", "Public booking disabled", 403);

  if (b.block_public_on_billing_issue) {
    const billing = await getTenantSubscriptionStatus(b.tenant_id);
    if (billing.effectiveAccess === "block") {
      return jsonError("FORBIDDEN", "Business is temporarily unavailable", 403);
    }
  }

  const services = await pool.query(
    `
      SELECT id, name, duration_min, buffer_before_min, buffer_after_min, price_amount_cents, price_currency
      FROM services
      WHERE tenant_id = $1
      AND is_active = true
      AND deleted_at IS NULL
      ORDER BY name ASC
    `,
    [b.tenant_id],
  );

  const staff = await pool.query(
    `
      SELECT u.id, u.full_name
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      AND u.is_active = true
      AND u.deleted_at IS NULL
      ORDER BY u.full_name ASC
    `,
    [b.tenant_id],
  );

  return jsonOk({
    business: {
      name: b.name,
      slug: b.slug,
      timezone: b.timezone,
    },
    services: services.rows,
    staff: staff.rows,
  });
}
