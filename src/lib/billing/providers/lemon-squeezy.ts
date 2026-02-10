import { env } from "@/lib/env";
import { hmacSha256Hex, safeEqualHex, tryJsonParse } from "@/lib/crypto";
import {
  BillingProvider,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  InternalEventClass,
  NormalizedBillingEvent,
} from "@/lib/billing/types";

type LemonSqueezyWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: {
      tenant_id?: string;
      [key: string]: unknown;
    };
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      status?: string;
      created_at?: string;
      updated_at?: string;
      cancelled?: boolean;
      cancelled_at?: string | null;
      order_id?: number;
      user_email?: string;
      custom_data?: {
        tenant_id?: string;
      };
    };
  };
};

function mapLemonEventClass(payload: LemonSqueezyWebhookPayload): InternalEventClass {
  const eventName = String(payload.meta?.event_name ?? "").toLowerCase();
  const status = String(payload.data?.attributes?.status ?? "").toLowerCase();

  // Clases de eventos (agrupación robusta para cambios menores de naming)
  if (eventName.includes("order_created") || eventName.includes("subscription_created")) {
    return "checkout_completed";
  }
  if (eventName.includes("subscription_payment_success") || eventName.includes("subscription_resumed")) {
    return "subscription_renewed";
  }
  if (eventName.includes("subscription_payment_failed")) {
    return "payment_failed";
  }
  if (eventName.includes("subscription_cancelled") || eventName.includes("subscription_expired")) {
    return "subscription_canceled";
  }

  if (status === "active") return "subscription_renewed";
  if (status === "cancelled" || status === "expired") return "subscription_canceled";
  if (status === "past_due" || status === "unpaid") return "payment_failed";

  return "unknown";
}

function extractTenantId(payload: LemonSqueezyWebhookPayload): string | undefined {
  if (payload.meta?.custom_data?.tenant_id) return payload.meta.custom_data.tenant_id;
  if (payload.data?.attributes?.custom_data?.tenant_id) return payload.data.attributes.custom_data.tenant_id;
  return undefined;
}

export class LemonSqueezyProvider implements BillingProvider {
  name = "lemon_squeezy" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    if (!env.LEMON_API_KEY || !env.LEMON_STORE_ID || !env.LEMON_VARIANT_ID) {
      throw new Error("LEMON_API_KEY, LEMON_STORE_ID and LEMON_VARIANT_ID are required");
    }

    const webhookUrl =
      env.LEMON_WEBHOOK_URL ?? (env.APP_BASE_URL ? `${env.APP_BASE_URL}/api/v1/webhooks/billing/lemon_squeezy` : undefined);

    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LEMON_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: {
                tenant_id: input.tenantId,
                plan_code: input.planCode,
              },
              email: input.customerEmail,
            },
            checkout_options: {
              embed: false,
              media: false,
              logo: true,
            },
            product_options: {
              redirect_url: input.successUrl,
              receipt_button_text: "Volver",
              receipt_link_url: input.successUrl,
            },
            expires_at: null,
            test_mode: false,
            webhook_url: webhookUrl,
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: env.LEMON_STORE_ID,
              },
            },
            variant: {
              data: {
                type: "variants",
                id: env.LEMON_VARIANT_ID,
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Lemon Squeezy checkout creation failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as {
      data?: { id?: string; attributes?: { url?: string } };
    };

    const checkoutUrl = data.data?.attributes?.url;
    if (!checkoutUrl) throw new Error("Lemon Squeezy checkout URL missing in response");

    return {
      provider: this.name,
      checkoutUrl,
      externalReference: data.data?.id ?? input.tenantId,
    };
  }

  verifySignature(headers: Headers, rawBody: string): boolean {
    if (!env.LEMON_WEBHOOK_SECRET) return false;
    const signature = headers.get("x-signature") ?? "";
    if (!signature) return false;

    const expected = hmacSha256Hex(env.LEMON_WEBHOOK_SECRET, rawBody);
    return safeEqualHex(signature, expected);
  }

  async handleWebhook(rawBody: string): Promise<NormalizedBillingEvent[]> {
    const payload = tryJsonParse<LemonSqueezyWebhookPayload>(rawBody);
    if (!payload) throw new Error("Invalid Lemon Squeezy webhook payload");

    const providerEventId =
      [payload.meta?.event_name, payload.data?.id, payload.data?.attributes?.updated_at].filter(Boolean).join(":") ||
      crypto.randomUUID();

    return [
      {
        providerEventId,
        tenantId: extractTenantId(payload),
        eventClass: mapLemonEventClass(payload),
        occurredAt: payload.data?.attributes?.updated_at ?? payload.data?.attributes?.created_at ?? new Date().toISOString(),
        raw: payload,
      },
    ];
  }
}
