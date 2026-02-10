import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getTenantSubscriptionStatus } from "@/lib/subscription";
import { jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const status = await getTenantSubscriptionStatus(auth.tenantId);
  return jsonOk(status);
}
