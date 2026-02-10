import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (!path.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const status = req.cookies.get("subscription_status")?.value ?? req.headers.get("x-subscription-status");
  if (!status) return NextResponse.next();
  if (["active", "trialing", "grace", "past_due"].includes(status)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/paywall";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
