CREATE TABLE IF NOT EXISTS business_whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES businesses(tenant_id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  phone_number_id TEXT,
  api_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_whatsapp_settings_tenant
  ON business_whatsapp_settings(tenant_id);

ALTER TABLE business_whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_business_whatsapp_settings ON business_whatsapp_settings;
CREATE POLICY tenant_isolation_business_whatsapp_settings ON business_whatsapp_settings
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
