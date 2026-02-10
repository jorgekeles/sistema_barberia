import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqualHex, tryJsonParse } from "@/lib/crypto";
import {
  BillingProvider,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  InternalEventClass,
  NormalizedBillingEvent,
} from "@/lib/billing/types";

type MercadoPagoWebhookPayload = {
  id?: string | number;
  action?: string;
  type?: string;
  data?: {
    id?: string | number;
    external_reference?: string;
    status?: string;
  };
  live_mode?: boolean;
  date_created?: string;
};

function mapMercadoPagoEventClass(payload: MercadoPagoWebhookPayload): InternalEventClass {
  const action = String(payload.action ?? "").toLowerCase();
  const type = String(payload.type ?? "").toLowerCase();
  const status = String(payload.data?.status ?? "").toLowerCase();

  // Clases de eventos (no nombres exactos acoplados)
  if (status === "approved" || action.includes("payment.approved")) return "checkout_completed";
  if (status === "authorized") return "checkout_completed";
  if (status === "rejected" || status === "cancelled") return "payment_failed";
  if (action.includes("subscription") && (action.includes("canceled") || action.includes("cancelled"))) {
    return "subscription_canceled";
  }
  if (action.includes("subscription") || type.includes("subscription")) return "subscription_renewed";
  if (action.includes("payment") && (action.includes("updated") || action.includes("created"))) {
    return status === "approved" ? "subscription_renewed" : "unknown";
  }

  return "unknown";
}

function getTenantIdFromMercadoPago(payload: MercadoPagoWebhookPayload): string | undefined {
  if (typeof payload.data?.external_reference === "string" && payload.data.external_reference.length > 0) {
    return payload.data.external_reference;
  }

  return undefined;
}

export class MercadoPagoProvider implements BillingProvider {
  name = "mercado_pago" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    if (!env.MP_ACCESS_TOKEN) {
      throw new Error("MP_ACCESS_TOKEN is required for Mercado Pago checkout");
    }

    const externalReference = input.tenantId;
    const webhookUrl = env.MP_WEBHOOK_URL ?? (env.APP_BASE_URL ? `${env.APP_BASE_URL}/api/v1/webhooks/billing/mercado_pago` : undefined);

    const body = {
      items: [
        {
          title: "Suscripcion mensual agenda online",
          quantity: 1,
          currency_id: "ARS",
          unit_price: Number(env.MP_PRICE_ARS_CENTS ?? "150000") / 100,
        },
      ],
      auto_return: "approved",
      external_reference: externalReference,
      back_urls: {
        success: input.successUrl,
        pending: input.successUrl,
        failure: input.cancelUrl,
      },
      notification_url: webhookUrl,
      metadata: {
        tenant_id: input.tenantId,
        plan_code: input.planCode,
      },
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago checkout creation failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as { init_point?: string; sandbox_init_point?: string; id?: string };
    const checkoutUrl = data.init_point ?? data.sandbox_init_point;

    if (!checkoutUrl) {
      throw new Error("Mercado Pago checkout URL missing in response");
    }

    return {
      provider: this.name,
      checkoutUrl,
      externalReference: data.id ?? externalReference,
    };
  }

  verifySignature(headers: Headers, rawBody: string): boolean {
    if (!env.MP_WEBHOOK_SECRET) return false;

    const signatureHeader = headers.get("x-signature") ?? headers.get("x-mp-signature") ?? "";

    // Modo token simple (proxy/reverse gateway): x-signature: <secret>
    if (safeEqualHex(signatureHeader, env.MP_WEBHOOK_SECRET)) return true;

    // Modo HMAC: x-signature: ts=...,v1=...
    const parts = signatureHeader.split(",").map((part) => part.trim());
    const v1 = parts.find((part) => part.startsWith("v1="))?.split("=")[1];
    if (!v1) return false;

    const expected = hmacSha256Hex(env.MP_WEBHOOK_SECRET, rawBody);
    return safeEqualHex(v1, expected);
  }

  async handleWebhook(rawBody: string): Promise<NormalizedBillingEvent[]> {
    const payload = tryJsonParse<MercadoPagoWebhookPayload>(rawBody);
    if (!payload) throw new Error("Invalid Mercado Pago webhook payload");

    const providerEventId = String(payload.id ?? payload.data?.id ?? crypto.randomUUID());

    return [
      {
        providerEventId,
        tenantId: getTenantIdFromMercadoPago(payload),
        eventClass: mapMercadoPagoEventClass(payload),
        occurredAt: payload.date_created ?? new Date().toISOString(),
        raw: payload,
      },
    ];
  }
}
