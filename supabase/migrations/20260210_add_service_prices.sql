ALTER TABLE services
  ADD COLUMN IF NOT EXISTS price_amount_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_currency CHAR(3) NOT NULL DEFAULT 'ARS';

CREATE INDEX IF NOT EXISTS idx_services_tenant_price
  ON services(tenant_id, price_amount_cents);
