import { NextRequest } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const createBusinessSchema = z.object({
  owner_name: z.string().min(2).max(120),
  owner_email: z.string().email().toLowerCase(),
  owner_password: z.string().min(8).max(128),
  business_name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  timezone: z.string().min(3).max(80).default("America/Argentina/Buenos_Aires"),
  country_code: z.string().length(2).default("AR"),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createBusinessSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const data = parsed.data;
  const slugBase = data.slug ?? slugify(data.business_name);
  const slug = slugBase || `barberia-${Math.floor(Math.random() * 100000)}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userExists = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [data.owner_email]);
    if (userExists.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("VALIDATION_ERROR", "Ya existe un usuario con ese email", 409);
    }

    const businessExists = await client.query("SELECT id FROM businesses WHERE slug = $1 LIMIT 1", [slug]);
    if (businessExists.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("VALIDATION_ERROR", "El slug ya esta en uso", 409);
    }

    const business = await client.query(
      `
        INSERT INTO businesses (tenant_id, name, slug, timezone, country_code)
        VALUES (gen_random_uuid(), $1, $2, $3, upper($4))
        RETURNING id, tenant_id, name, slug, timezone, country_code, trial_starts_at, trial_ends_at
      `,
      [data.business_name, slug, data.timezone, data.country_code],
    );

    const tenantId = business.rows[0].tenant_id;

    const user = await client.query(
      `
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, crypt($2, gen_salt('bf')), $3)
        RETURNING id, email, full_name
      `,
      [data.owner_email, data.owner_password, data.owner_name],
    );

    await client.query(
      `
        INSERT INTO memberships (tenant_id, user_id, role)
        VALUES ($1, $2, 'owner')
      `,
      [tenantId, user.rows[0].id],
    );

    await client.query(
      `
        INSERT INTO subscriptions (tenant_id, provider, status, plan_code, price_usd_cents, current_period_start, current_period_end)
        VALUES ($1, 'lemon_squeezy', 'trialing', 'monthly_v1', 1500, now(), now() + interval '30 days')
      `,
      [tenantId],
    );

    await client.query("COMMIT");

    return jsonOk(
      {
        business: business.rows[0],
        owner: user.rows[0],
      },
      201,
    );
  } catch {
    await client.query("ROLLBACK");
    return jsonError("INTERNAL_ERROR", "No se pudo crear la cuenta", 500);
  } finally {
    client.release();
  }
}
