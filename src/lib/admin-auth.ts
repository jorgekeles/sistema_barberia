import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const ADMIN_COOKIE_NAME = "admin_panel_token";

const encoder = new TextEncoder();
const secret = encoder.encode(`${env.JWT_SECRET}:admin-panel`);

export function getAdminCredentials() {
  return {
    username: env.ADMIN_PANEL_USERNAME ?? "admin",
    password: env.ADMIN_PANEL_PASSWORD ?? "secret",
  };
}

export async function signAdminToken() {
  return new SignJWT({ scope: "admin_panel" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifyAdminToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload.scope === "admin_panel";
}
