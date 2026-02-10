import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const updated = await pool.query(
    `
      UPDATE appointments
      SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE id = $1
      AND tenant_id = $2
      AND status = 'confirmed'
      AND deleted_at IS NULL
      RETURNING id, status, canceled_at
    `,
    [id, auth.tenantId],
  );

  if (!updated.rowCount) return jsonError("NOT_FOUND", "Appointment not found or already canceled", 404);
  return jsonOk({ appointment_id: updated.rows[0].id, status: updated.rows[0].status, canceled_at: updated.rows[0].canceled_at });
}
