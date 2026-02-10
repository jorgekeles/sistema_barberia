import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const updateServiceSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  duration_min: z.number().int().min(5).max(480).optional(),
  buffer_before_min: z.number().int().min(0).max(120).optional(),
  buffer_after_min: z.number().int().min(0).max(120).optional(),
  price_amount_cents: z.number().int().min(0).max(10_000_000).optional(),
  price_currency: z.string().length(3).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const keys = Object.keys(parsed.data);
  if (!keys.length) return jsonError("VALIDATION_ERROR", "No fields to update", 400);

  const setClauses = keys.map((k, i) => {
    if (k === "price_currency") return `${k} = upper($${i + 3})`;
    return `${k} = $${i + 3}`;
  });
  const values = keys.map((k) => (parsed.data as Record<string, unknown>)[k]);

  const updated = await pool.query(
    `
      UPDATE services
      SET ${setClauses.join(", ")}, updated_at = now()
      WHERE id = $1
      AND tenant_id = $2
      AND deleted_at IS NULL
      RETURNING id, name, duration_min, buffer_before_min, buffer_after_min, price_amount_cents, price_currency, is_active, created_at
    `,
    [id, auth.tenantId, ...values],
  );

  if (!updated.rowCount) return jsonError("NOT_FOUND", "Service not found", 404);
  return jsonOk(updated.rows[0]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const { id } = await params;

  const deleted = await pool.query(
    `
      UPDATE services
      SET deleted_at = now(), is_active = false, updated_at = now()
      WHERE id = $1
      AND tenant_id = $2
      AND deleted_at IS NULL
      RETURNING id
    `,
    [id, auth.tenantId],
  );

  if (!deleted.rowCount) return jsonError("NOT_FOUND", "Service not found", 404);
  return jsonOk({ ok: true });
}
