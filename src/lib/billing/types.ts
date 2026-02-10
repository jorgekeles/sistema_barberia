export type BillingProviderName = "mercado_pago" | "lemon_squeezy" | "stripe";

export type InternalEventClass =
  | "checkout_completed"
  | "subscription_renewed"
  | "payment_failed"
  | "subscription_canceled"
  | "unknown";

export type CreateCheckoutInput = {
  tenantId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
};

export type CreateCheckoutOutput = {
  provider: BillingProviderName;
  checkoutUrl: string;
  externalReference: string;
};

export type NormalizedBillingEvent = {
  providerEventId: string;
  tenantId?: string;
  eventClass: InternalEventClass;
  occurredAt: string;
  raw: unknown;
};

export interface BillingProvider {
  name: BillingProviderName;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput>;
  verifySignature(headers: Headers, rawBody: string): boolean;
  handleWebhook(rawBody: string): Promise<NormalizedBillingEvent[]>;
}
