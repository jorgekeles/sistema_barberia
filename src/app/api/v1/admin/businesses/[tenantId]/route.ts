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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const allowed = await requireAdmin(req);
  if (!allowed) return jsonError("UNAUTHORIZED", "Admin session required", 401);

  const { tenantId } = await params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const business = await client.query(
      `
        UPDATE businesses
        SET
          deleted_at = now(),
          public_booking_enabled = false,
          block_public_on_billing_issue = true,
          updated_at = now()
        WHERE tenant_id = $1
          AND deleted_at IS NULL
        RETURNING tenant_id
      `,
      [tenantId],
    );

    if (!business.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("NOT_FOUND", "Business not found", 404);
    }

    await client.query(
      `
        UPDATE subscriptions
        SET status = 'blocked', blocked_at = now(), updated_at = now()
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    await client.query("COMMIT");
    return jsonOk({ ok: true, tenant_id: tenantId });
  } catch {
    await client.query("ROLLBACK");
    return jsonError("INTERNAL_ERROR", "Could not delete business", 500);
  } finally {
    client.release();
  }
}
