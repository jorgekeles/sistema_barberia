import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const updateBusinessSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  timezone: z.string().min(3).max(80).optional(),
  public_booking_enabled: z.boolean().optional(),
  block_public_on_billing_issue: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const result = await pool.query(
    `SELECT id, tenant_id, name, slug, timezone, country_code, public_booking_enabled, block_public_on_billing_issue, trial_starts_at, trial_ends_at
     FROM businesses WHERE tenant_id = $1 LIMIT 1`,
    [auth.tenantId],
  );

  if (!result.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  return jsonOk(result.rows[0]);
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = updateBusinessSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const keys = Object.keys(parsed.data);
  if (!keys.length) return jsonError("VALIDATION_ERROR", "No fields to update", 400);

  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => (parsed.data as Record<string, unknown>)[k]);

  const query = `
    UPDATE businesses
    SET ${setClauses.join(", ")}, updated_at = now()
    WHERE tenant_id = $1
    RETURNING id, tenant_id, name, slug, timezone, country_code, public_booking_enabled, block_public_on_billing_issue
  `;

  const updated = await pool.query(query, [auth.tenantId, ...values]);
  return jsonOk(updated.rows[0]);
}
