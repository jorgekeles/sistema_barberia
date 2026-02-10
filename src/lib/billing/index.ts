import { LemonSqueezyProvider } from "@/lib/billing/providers/lemon-squeezy";
import { MercadoPagoProvider } from "@/lib/billing/providers/mercado-pago";
import { StripeProvider } from "@/lib/billing/providers/stripe";
import { BillingProvider, BillingProviderName } from "@/lib/billing/types";

const providers: Record<BillingProviderName, BillingProvider> = {
  mercado_pago: new MercadoPagoProvider(),
  lemon_squeezy: new LemonSqueezyProvider(),
  stripe: new StripeProvider(),
};

export function getBillingProvider(name: BillingProviderName) {
  return providers[name];
}

export function resolveProviderByCountry(countryCode: string): BillingProviderName {
  return countryCode.toUpperCase() === "AR" ? "mercado_pago" : "lemon_squeezy";
}
