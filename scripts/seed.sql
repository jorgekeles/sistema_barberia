-- Demo seed (dev only)
INSERT INTO businesses (id, tenant_id, name, slug, timezone, country_code)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Barberia Demo',
  'barberia-demo',
  'America/Argentina/Buenos_Aires',
  'AR'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, email, password_hash, full_name)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'owner@demo.com',
  crypt('changeme123', gen_salt('bf')),
  'Owner Demo'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO memberships (tenant_id, user_id, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'owner'
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO services (id, tenant_id, name, duration_min, buffer_before_min, buffer_after_min)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Corte clásico',
  30,
  0,
  5
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO availability_rules (tenant_id, day_of_week, start_local, end_local, slot_step_min)
VALUES
('11111111-1111-1111-1111-111111111111', 1, '09:00', '18:00', 15),
('11111111-1111-1111-1111-111111111111', 2, '09:00', '18:00', 15),
('11111111-1111-1111-1111-111111111111', 3, '09:00', '18:00', 15),
('11111111-1111-1111-1111-111111111111', 4, '09:00', '18:00', 15),
('11111111-1111-1111-1111-111111111111', 5, '09:00', '18:00', 15)
ON CONFLICT DO NOTHING;
