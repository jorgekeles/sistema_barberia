import { pool } from "@/lib/db";
import { nextSubscriptionStatus } from "@/lib/billing/state-machine";
import { BillingProviderName, NormalizedBillingEvent } from "@/lib/billing/types";

export async function persistPaymentEvent(provider: BillingProviderName, event: NormalizedBillingEvent, signatureValid: boolean) {
  await pool.query(
    `
      INSERT INTO payment_events (tenant_id, provider, provider_event_id, event_class, signature_valid, payload, status)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'received')
      ON CONFLICT (provider, provider_event_id) DO NOTHING
    `,
    [event.tenantId ?? null, provider, event.providerEventId, event.eventClass, signatureValid, JSON.stringify(event.raw)],
  );
}

export async function applySubscriptionEvent(provider: BillingProviderName, event: NormalizedBillingEvent) {
  if (!event.tenantId) return;

  const current = await pool.query(
    `SELECT id, status FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [event.tenantId],
  );

  if (!current.rowCount) {
    const next = nextSubscriptionStatus("trialing", event.eventClass);
    await pool.query(
      `
      INSERT INTO subscriptions (tenant_id, provider, status, plan_code, price_usd_cents, last_event_at)
      VALUES ($1, $2, $3, 'monthly_v1', 1500, now())
      `,
      [event.tenantId, provider, next],
    );
    return;
  }

  const next = nextSubscriptionStatus(current.rows[0].status, event.eventClass);
  await pool.query(
    `UPDATE subscriptions SET status = $2, last_event_at = now(), updated_at = now() WHERE id = $1`,
    [current.rows[0].id, next],
  );
}
