import { NextRequest } from "next/server";
import { loginSchema } from "@/lib/schemas/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { signAccessToken, signRefreshToken, validateUserCredentials } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const user = await validateUserCredentials(parsed.data.email, parsed.data.password);
  if (!user) return jsonError("UNAUTHORIZED", "Invalid credentials", 401);

  const accessToken = await signAccessToken({ sub: user.id, tenant_id: user.tenant_id, role: user.role });
  const refreshToken = await signRefreshToken({ sub: user.id, tenant_id: user.tenant_id });

  return jsonOk({ access_token: accessToken, refresh_token: refreshToken, expires_in: 900 });
}
