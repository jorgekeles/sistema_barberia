import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    return await verifyAdminToken(token);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const allowed = await requireAdmin(req);
  if (!allowed) return jsonError("UNAUTHORIZED", "Admin session required", 401);

  const { tenantId } = await params;

  const updated = await pool.query(
    `
      UPDATE subscriptions
      SET
        status = 'canceled',
        cancel_at_period_end = false,
        blocked_at = now(),
        updated_at = now()
      WHERE id = (
        SELECT s.id
        FROM subscriptions s
        WHERE s.tenant_id = $1
        ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
        LIMIT 1
      )
      RETURNING tenant_id, status
    `,
    [tenantId],
  );

  if (!updated.rowCount) return jsonError("NOT_FOUND", "Subscription not found", 404);
  return jsonOk({ ok: true, tenant_id: updated.rows[0].tenant_id, status: updated.rows[0].status });
}
