import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const createStaffSchema = z.object({
  full_name: z.string().min(2).max(120),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  const staff = await pool.query(
    `
      SELECT u.id, u.full_name, u.email, m.role
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      AND u.is_active = true
      AND u.deleted_at IS NULL
      ORDER BY
        CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
        u.full_name ASC
    `,
    [auth.tenantId],
  );

  return jsonOk({ staff: staff.rows });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  const data = parsed.data;
  const safeName = data.full_name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30);
  const generatedEmail = `${safeName || "barbero"}.${crypto.randomUUID().slice(0, 8)}@staff.local`;
  const generatedPassword = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const createdUser = await client.query(
      `
        INSERT INTO users (email, password_hash, full_name, is_active)
        VALUES ($1, crypt($2, gen_salt('bf')), $3, true)
        RETURNING id, email, full_name
      `,
      [generatedEmail, generatedPassword, data.full_name],
    );
    const userId = createdUser.rows[0].id;

    const membership = await client.query(
      `
        INSERT INTO memberships (tenant_id, user_id, role)
        VALUES ($1, $2, $3::membership_role)
        RETURNING role
      `,
      [auth.tenantId, userId, "staff"],
    );

    await client.query("COMMIT");

    return jsonOk(
      {
        id: userId,
        full_name: createdUser.rows[0].full_name,
        email: createdUser.rows[0].email,
        role: membership.rows[0].role,
      },
      201,
    );
  } catch {
    await client.query("ROLLBACK");
    return jsonError("INTERNAL_ERROR", "No se pudo crear el barbero", 500);
  } finally {
    client.release();
  }
}
