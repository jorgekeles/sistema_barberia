import { NextRequest } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { BillingProviderName } from "@/lib/billing/types";
import { jsonError, jsonOk } from "@/lib/http";
import { applySubscriptionEvent, persistPaymentEvent } from "@/lib/payment";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const rawBody = await req.text();
  const { provider } = await params;

  if (!["mercado_pago", "lemon_squeezy", "stripe"].includes(provider)) {
    return jsonError("NOT_FOUND", "Unknown provider", 404);
  }

  const adapter = getBillingProvider(provider as BillingProviderName);
  const signatureValid = adapter.verifySignature(req.headers, rawBody);

  if (!signatureValid) return jsonError("FORBIDDEN", "Invalid signature", 403);

  try {
    const events = await adapter.handleWebhook(rawBody);

    for (const event of events) {
      await persistPaymentEvent(adapter.name, event, signatureValid);
      await applySubscriptionEvent(adapter.name, event);
    }

    return jsonOk({ ok: true });
  } catch (error) {
    logError("webhook_processing_failed", error, { provider });
    return jsonError("INTERNAL_ERROR", "Webhook processing failed", 500);
  }
}
