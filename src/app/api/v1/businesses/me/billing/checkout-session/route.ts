import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getBillingProvider, resolveProviderByCountry } from "@/lib/billing";

const schema = z.object({
  provider: z.enum(["mercado_pago", "lemon_squeezy", "stripe"]).optional(),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const business = await pool.query("SELECT country_code FROM businesses WHERE tenant_id = $1 LIMIT 1", [auth.tenantId]);
  if (!business.rowCount) return jsonError("NOT_FOUND", "Business not found", 404);
  const user = await pool.query("SELECT email FROM users WHERE id = $1 LIMIT 1", [auth.userId]);

  const providerName = parsed.data.provider ?? resolveProviderByCountry(business.rows[0].country_code);
  const provider = getBillingProvider(providerName);

  const checkout = await provider.createCheckout({
    tenantId: auth.tenantId,
    planCode: "monthly_v1",
    successUrl: parsed.data.success_url ?? "https://example.com/success",
    cancelUrl: parsed.data.cancel_url ?? "https://example.com/cancel",
    customerEmail: user.rows[0]?.email,
  });

  return jsonOk(checkout, 201);
}
