import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonOk } from "@/lib/http";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  await pool.query(
    `
      UPDATE subscriptions
      SET cancel_at_period_end = true, updated_at = now()
      WHERE tenant_id = $1
      AND status IN ('active', 'past_due', 'grace', 'trialing')
    `,
    [auth.tenantId],
  );

  return jsonOk({ ok: true });
}
