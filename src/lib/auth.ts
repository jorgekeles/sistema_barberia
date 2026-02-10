import { SignJWT, jwtVerify } from "jose";
import { pool } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";

const encoder = new TextEncoder();
const secret = encoder.encode(env.JWT_SECRET);

type AuthPayload = {
  sub: string;
  tenant_id: string;
  role: "owner" | "manager" | "staff";
};

export async function signAccessToken(payload: AuthPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function signRefreshToken(payload: Pick<AuthPayload, "sub" | "tenant_id">) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as AuthPayload;
}

export async function getAuthContext(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonError("UNAUTHORIZED", "Missing token", 401) };
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
    };
  } catch {
    return { error: jsonError("UNAUTHORIZED", "Invalid token", 401) };
  }
}

export async function validateUserCredentials(email: string, password: string) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.email,
        m.tenant_id,
        m.role
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      WHERE u.email = $1
      AND u.is_active = true
      AND u.password_hash = crypt($2, u.password_hash)
      LIMIT 1
    `,
    [email, password],
  );

  return result.rows[0] as
    | {
        id: string;
        email: string;
        tenant_id: string;
        role: "owner" | "manager" | "staff";
      }
    | undefined;
}
