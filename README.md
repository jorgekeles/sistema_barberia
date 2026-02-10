# sistema_barberia

MVP multi-tenant de agenda online para barberias/peluquerias optimizado para **$0/mes inicial** con:
- **Vercel Free**: frontend + API (`Next.js App Router`)
- **Supabase Free**: PostgreSQL real (con constraints anti-overbooking)

## 1) Stack implementado
- `Next.js 15` + TypeScript
- API REST en `src/app/api/v1/*`
- PostgreSQL (Supabase) vía `pg`
- SQL de dominio y concurrencia en `supabase/migrations/20260210_init.sql`
- Billing desacoplado con adapters (`Mercado Pago` real, `Lemon Squeezy` real, `Stripe` placeholder)

## 2) Estructura clave
- `supabase/migrations/20260210_init.sql`: tablas, índices, RLS, funciones SQL
- `src/app/api/v1/public/b/[slug]/slots/route.ts`: disponibilidad pública
- `src/app/api/v1/public/b/[slug]/appointments/route.ts`: reserva pública con idempotencia
- `src/lib/billing/*`: Payment Abstraction Layer
- `src/app/api/v1/webhooks/billing/[provider]/route.ts`: webhooks provider-agnostic

## 3) Setup local
1. Crear `.env.local` basado en `.env.example`.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Correr migración:
   ```bash
   npm run db:migrate
   ```
4. (Opcional) cargar seed demo:
   ```bash
   psql "$DATABASE_URL" -f scripts/seed.sql
   ```
5. Levantar app:
   ```bash
   npm run dev
   ```

## 4) Deploy en Vercel + Supabase (free tier)
1. Crear proyecto en Supabase y copiar `DATABASE_URL` (pooled o direct con ssl).
2. Ejecutar migración SQL en Supabase SQL Editor o con `psql`.
3. Subir repo a GitHub.
4. Importar proyecto en Vercel.
5. Configurar variables en Vercel:
   - `APP_BASE_URL`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `BILLING_SUCCESS_URL`
   - `BILLING_CANCEL_URL`
   - `MP_ACCESS_TOKEN`
   - `MP_PRICE_ARS_CENTS`
   - `MP_WEBHOOK_URL`
   - `MP_WEBHOOK_SECRET`
   - `LEMON_API_KEY`
   - `LEMON_STORE_ID`
   - `LEMON_VARIANT_ID`
   - `LEMON_WEBHOOK_URL`
   - `LEMON_WEBHOOK_SECRET`
6. Deploy.

## 4.2) Notificaciones WhatsApp (opcional)
- Configurar en entorno:
  - `WHATSAPP_ENABLED=true`
  - `WHATSAPP_API_TOKEN=<token de WhatsApp Cloud API>`
  - `WHATSAPP_PHONE_NUMBER_ID=<phone number id>`
- Al confirmar una reserva publica se envia un mensaje al telefono del cliente.
- Si no configuras estas variables, la reserva se confirma igual y solo se omite el envio.

## 4.1) Configuración de proveedores
- Mercado Pago:
  - Crear credenciales de app y usar `MP_ACCESS_TOKEN`.
  - Configurar webhook hacia `.../api/v1/webhooks/billing/mercado_pago`.
  - Checkout se crea con `POST /checkout/preferences`.
- Lemon Squeezy:
  - Crear API key, Store y Variant de suscripción mensual.
  - Configurar signing secret (`LEMON_WEBHOOK_SECRET`).
  - Configurar webhook hacia `.../api/v1/webhooks/billing/lemon_squeezy`.
  - Checkout se crea con `POST /v1/checkouts`.

## 5) Endpoints base
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/businesses/me`
- `PATCH /api/v1/businesses/me`
- `GET /api/v1/public/b/:slug/slots`
- `POST /api/v1/public/b/:slug/appointments` (`Idempotency-Key` requerido)
- `GET /api/v1/businesses/me/appointments`
- `GET|POST /api/v1/businesses/me/availability-rules`
- `GET|POST /api/v1/businesses/me/availability-exceptions`
- `GET /api/v1/businesses/me/billing/status`
- `POST /api/v1/businesses/me/billing/checkout-session`
- `POST /api/v1/businesses/me/billing/cancel`
- `POST /api/v1/webhooks/billing/:provider`

## 6) Anti-overbooking implementado
- Constraint: `EXCLUDE USING GIST (...) slot_range WITH &&`
- Función atómica: `create_appointment_atomic(...)`
- Idempotencia: unique `(tenant_id, idempotency_key)`

## 7) Notas para producción
- Reemplazar rate limit en memoria por Redis (Upstash).
- Ajustar mapping de clases de eventos según eventos exactos habilitados en cada cuenta.
- Añadir job nocturno de reconciliación billing.
- Añadir tests de concurrencia (50+ requests al mismo slot).

## 8) Test rápido de anti-overbooking (concurrencia)
Lanza requests simultáneos al mismo slot público y valida que solo 1 reserve.

```bash
START_AT=2026-02-12T15:00:00Z REQUESTS=20 PARALLEL=20 bash scripts/booking_concurrency_test.sh
```

Esperado:
- `201/200` totales: `1`
- resto `409` (o algunos `429` si el rate limit público entra en juego)


## Migracion adicional (WhatsApp por negocio)
Ejecutar despues de actualizar codigo:
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260210_add_whatsapp_settings.sql
```

## Migracion adicional (precios por servicio)
Ejecutar despues de actualizar codigo:
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260210_add_service_prices.sql
```
