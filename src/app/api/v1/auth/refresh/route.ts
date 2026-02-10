import { NextRequest } from "next/server";
import { refreshSchema } from "@/lib/schemas/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { signAccessToken, verifyToken } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  try {
    const payload = await verifyToken(parsed.data.refresh_token);
    const membership = await pool.query(
      "SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1",
      [payload.tenant_id, payload.sub],
    );

    if (!membership.rowCount) return jsonError("UNAUTHORIZED", "Membership not found", 401);

    const accessToken = await signAccessToken({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      role: membership.rows[0].role,
    });

    return jsonOk({ access_token: accessToken, expires_in: 900 });
  } catch {
    return jsonError("UNAUTHORIZED", "Invalid refresh token", 401);
  }
}
