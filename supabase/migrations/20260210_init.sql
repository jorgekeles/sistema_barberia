CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('owner', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('confirmed', 'canceled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE exception_kind AS ENUM ('closed_full_day', 'closed_partial', 'open_special', 'manual_block');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'grace', 'canceled', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE billing_provider AS ENUM ('mercado_pago', 'lemon_squeezy', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_event_status AS ENUM ('received', 'processed', 'failed', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug CITEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  public_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  block_public_on_billing_issue BOOLEAN NOT NULL DEFAULT TRUE,
  trial_starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  schedule_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  user_id UUID NOT NULL REFERENCES users(id),
  role membership_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  name TEXT NOT NULL,
  duration_min SMALLINT NOT NULL CHECK (duration_min > 0 AND duration_min <= 480),
  buffer_before_min SMALLINT NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
  buffer_after_min SMALLINT NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  staff_user_id UUID REFERENCES users(id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_local TIME NOT NULL,
  end_local TIME NOT NULL,
  slot_step_min SMALLINT NOT NULL DEFAULT 15 CHECK (slot_step_min IN (5,10,15,20,30,60)),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_local > start_local)
);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  staff_user_id UUID REFERENCES users(id),
  exception_date DATE NOT NULL,
  kind exception_kind NOT NULL,
  start_local TIME,
  end_local TIME,
  reason TEXT,
  priority SMALLINT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'closed_full_day' AND start_local IS NULL AND end_local IS NULL)
    OR
    (kind IN ('closed_partial', 'open_special', 'manual_block') AND start_local IS NOT NULL AND end_local IS NOT NULL AND end_local > start_local)
  )
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  staff_user_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email CITEXT,
  notes TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  slot_range TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED,
  status appointment_status NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL DEFAULT 'public',
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CHECK (end_at > start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_tenant_idempotency
  ON appointments(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE appointments
  ADD CONSTRAINT ex_appointments_no_overlap
  EXCLUDE USING GIST (
    tenant_id WITH =,
    COALESCE(staff_user_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    slot_range WITH &&
  )
  WHERE (status = 'confirmed' AND deleted_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  provider billing_provider NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status subscription_status NOT NULL,
  plan_code TEXT NOT NULL DEFAULT 'monthly_v1',
  price_usd_cents INTEGER NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  grace_ends_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  provider billing_provider NOT NULL,
  provider_customer_id TEXT NOT NULL,
  email CITEXT,
  country_code CHAR(2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_customer_id),
  UNIQUE(tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES businesses(tenant_id),
  provider billing_provider NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_class TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  status payment_event_status NOT NULL DEFAULT 'received',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES businesses(tenant_id),
  actor_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  request_id TEXT,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_availability_rules_tenant_dow ON availability_rules(tenant_id, day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_availability_exceptions_tenant_date ON availability_exceptions(tenant_id, exception_date, priority);

CREATE OR REPLACE FUNCTION create_appointment_atomic(
  p_tenant_id UUID,
  p_staff_user_id UUID,
  p_service_id UUID,
  p_start_at TIMESTAMPTZ,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email CITEXT,
  p_notes TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (appointment_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_duration SMALLINT;
  v_buffer_before SMALLINT;
  v_buffer_after SMALLINT;
  v_end_at TIMESTAMPTZ;
BEGIN
  SELECT duration_min, buffer_before_min, buffer_after_min
  INTO v_duration, v_buffer_before, v_buffer_after
  FROM services
  WHERE id = p_service_id
  AND tenant_id = p_tenant_id
  AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_start_at < now() + interval '30 minutes' THEN
    RAISE EXCEPTION 'Lead time violation' USING ERRCODE = 'P0001';
  END IF;

  v_end_at := p_start_at + make_interval(mins => v_duration + v_buffer_after);

  INSERT INTO appointments (
    tenant_id, staff_user_id, service_id, customer_name, customer_phone, customer_email, notes,
    start_at, end_at, status, source, idempotency_key
  )
  VALUES (
    p_tenant_id, p_staff_user_id, p_service_id, p_customer_name, p_customer_phone, p_customer_email, p_notes,
    p_start_at - make_interval(mins => v_buffer_before),
    v_end_at,
    'confirmed',
    'public',
    p_idempotency_key
  )
  ON CONFLICT (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO appointment_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION compute_public_slots(
  p_slug TEXT,
  p_from_date DATE,
  p_to_date DATE,
  p_service_id UUID,
  p_staff_user_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  timezone TEXT,
  staff_user_id UUID,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
WITH biz AS (
  SELECT tenant_id, timezone
  FROM businesses
  WHERE slug = p_slug::citext
  AND public_booking_enabled = TRUE
  LIMIT 1
), svc AS (
  SELECT duration_min, buffer_before_min, buffer_after_min
  FROM services s
  JOIN biz b ON b.tenant_id = s.tenant_id
  WHERE s.id = p_service_id
  AND s.is_active = TRUE
  LIMIT 1
), days AS (
  SELECT generate_series(p_from_date::timestamp, p_to_date::timestamp, interval '1 day')::date AS d
), rules AS (
  SELECT r.*, b.timezone
  FROM availability_rules r
  JOIN biz b ON b.tenant_id = r.tenant_id
  WHERE r.is_active = TRUE
    AND (p_staff_user_id IS NULL OR r.staff_user_id = p_staff_user_id OR r.staff_user_id IS NULL)
), candidate_slots AS (
  SELECT
    r.timezone,
    COALESCE(r.staff_user_id, p_staff_user_id) AS staff_user_id,
    ((d.d::text || ' ' || r.start_local::text)::timestamp AT TIME ZONE r.timezone)
      + (gs.n * make_interval(mins => r.slot_step_min)) AS start_at,
    ((d.d::text || ' ' || r.start_local::text)::timestamp AT TIME ZONE r.timezone)
      + (gs.n * make_interval(mins => r.slot_step_min))
      + make_interval(mins => (SELECT duration_min + buffer_after_min FROM svc)) AS end_at,
    ((d.d::text || ' ' || r.end_local::text)::timestamp AT TIME ZONE r.timezone) AS day_end_at
  FROM days d
  JOIN rules r ON extract(dow FROM d.d) = r.day_of_week
  CROSS JOIN LATERAL generate_series(
    0,
    GREATEST(
      0,
      floor((extract(epoch FROM (r.end_local - r.start_local)) / 60) / r.slot_step_min)::int
    )
  ) AS gs(n)
), filtered AS (
  SELECT c.*
  FROM candidate_slots c
  WHERE c.end_at <= c.day_end_at
    AND c.start_at >= now() + interval '30 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM appointments a
      JOIN biz b ON b.tenant_id = a.tenant_id
      WHERE a.status = 'confirmed'
        AND a.deleted_at IS NULL
        AND (a.staff_user_id = c.staff_user_id OR c.staff_user_id IS NULL)
        AND a.slot_range && tstzrange(c.start_at, c.end_at, '[)')
    )
)
SELECT f.timezone, f.staff_user_id, f.start_at, f.end_at
FROM filtered f
ORDER BY f.start_at
LIMIT LEAST(p_limit, 500);
$$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_businesses ON businesses;
CREATE POLICY tenant_isolation_businesses ON businesses
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_memberships ON memberships;
CREATE POLICY tenant_isolation_memberships ON memberships
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_services ON services;
CREATE POLICY tenant_isolation_services ON services
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_availability_rules ON availability_rules;
CREATE POLICY tenant_isolation_availability_rules ON availability_rules
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_availability_exceptions ON availability_exceptions;
CREATE POLICY tenant_isolation_availability_exceptions ON availability_exceptions
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_appointments ON appointments;
CREATE POLICY tenant_isolation_appointments ON appointments
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_payment_customers ON payment_customers;
CREATE POLICY tenant_isolation_payment_customers ON payment_customers
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_payment_events ON payment_events;
CREATE POLICY tenant_isolation_payment_events ON payment_events
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_audit_log ON audit_log;
CREATE POLICY tenant_isolation_audit_log ON audit_log
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
