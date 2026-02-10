import {
  BillingProvider,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  NormalizedBillingEvent,
} from "@/lib/billing/types";

export class StripeProvider implements BillingProvider {
  name = "stripe" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    return {
      provider: this.name,
      checkoutUrl: `https://checkout.stripe.com/mock?tenant=${input.tenantId}`,
      externalReference: crypto.randomUUID(),
    };
  }

  verifySignature(headers: Headers, rawBody: string): boolean {
    const signature = headers.get("stripe-signature");
    return Boolean(signature && rawBody.length > 0);
  }

  async handleWebhook(rawBody: string): Promise<NormalizedBillingEvent[]> {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    return [
      {
        providerEventId: String(payload.id ?? crypto.randomUUID()),
        tenantId: undefined,
        eventClass: "unknown",
        occurredAt: new Date().toISOString(),
        raw: payload,
      },
    ];
  }
}
