import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { jsonOk } from "@/lib/http";

export async function POST() {
  const res = jsonOk({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
