import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const serviceSchema = z.object({
  name: z.string().min(2).max(120),
  duration_min: z.number().int().min(5).max(480),
  buffer_before_min: z.number().int().min(0).max(120).default(0),
  buffer_after_min: z.number().int().min(0).max(120).default(0),
  price_amount_cents: z.number().int().min(0).max(10_000_000).default(0),
  price_currency: z.string().length(3).default("ARS"),
  is_active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const services = await pool.query(
    `
      SELECT id, name, duration_min, buffer_before_min, buffer_after_min, price_amount_cents, price_currency, is_active, created_at
      FROM services
      WHERE tenant_id = $1
      AND deleted_at IS NULL
      ORDER BY is_active DESC, name ASC
    `,
    [auth.tenantId],
  );

  return jsonOk({ services: services.rows });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const row = await pool.query(
    `
      INSERT INTO services (
        tenant_id, name, duration_min, buffer_before_min, buffer_after_min, price_amount_cents, price_currency, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, upper($7), $8)
      RETURNING id, name, duration_min, buffer_before_min, buffer_after_min, price_amount_cents, price_currency, is_active, created_at
    `,
    [
      auth.tenantId,
      parsed.data.name,
      parsed.data.duration_min,
      parsed.data.buffer_before_min,
      parsed.data.buffer_after_min,
      parsed.data.price_amount_cents,
      parsed.data.price_currency,
      parsed.data.is_active,
    ],
  );

  return jsonOk(row.rows[0], 201);
}
