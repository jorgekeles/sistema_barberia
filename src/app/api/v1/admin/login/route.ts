import { NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE_NAME, getAdminCredentials, signAdminToken } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const credentials = getAdminCredentials();
  if (parsed.data.username !== credentials.username || parsed.data.password !== credentials.password) {
    return jsonError("UNAUTHORIZED", "Invalid admin credentials", 401);
  }

  const token = await signAdminToken();
  const res = jsonOk({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return res;
}
