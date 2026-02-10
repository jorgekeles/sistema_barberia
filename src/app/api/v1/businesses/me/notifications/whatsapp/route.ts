import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { pool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const updateSchema = z.object({
  enabled: z.boolean(),
  phone_number_id: z.string().min(5).max(120).optional(),
  api_token: z.string().min(20).max(500).optional(),
  clear_api_token: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;

  try {
    const row = await pool.query(
      `
        SELECT enabled, phone_number_id, api_token
        FROM business_whatsapp_settings
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [auth.tenantId],
    );

    if (!row.rowCount) {
      return jsonOk({ enabled: false, phone_number_id: "", has_api_token: false });
    }

    return jsonOk({
      enabled: row.rows[0].enabled,
      phone_number_id: row.rows[0].phone_number_id ?? "",
      has_api_token: Boolean(row.rows[0].api_token),
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError.code === "42P01") {
      return jsonOk({ enabled: false, phone_number_id: "", has_api_token: false });
    }
    return jsonError("INTERNAL_ERROR", "No se pudo cargar configuracion WhatsApp", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if ("error" in auth) return auth.error;
  if (auth.role === "staff") return jsonError("FORBIDDEN", "Insufficient role", 403);

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, 400);

  try {
    const current = await pool.query(
      `SELECT api_token FROM business_whatsapp_settings WHERE tenant_id = $1 LIMIT 1`,
      [auth.tenantId],
    );

    const nextToken = parsed.data.clear_api_token
      ? null
      : parsed.data.api_token
        ? parsed.data.api_token
        : current.rows[0]?.api_token ?? null;

    const result = await pool.query(
      `
        INSERT INTO business_whatsapp_settings (tenant_id, enabled, phone_number_id, api_token, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (tenant_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          phone_number_id = EXCLUDED.phone_number_id,
          api_token = EXCLUDED.api_token,
          updated_at = now()
        RETURNING enabled, phone_number_id, api_token
      `,
      [
        auth.tenantId,
        parsed.data.enabled,
        parsed.data.phone_number_id ?? "",
        nextToken,
      ],
    );

    return jsonOk({
      enabled: result.rows[0].enabled,
      phone_number_id: result.rows[0].phone_number_id ?? "",
      has_api_token: Boolean(result.rows[0].api_token),
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError.code === "42P01") {
      return jsonError("VALIDATION_ERROR", "Falta migracion de WhatsApp. Ejecuta 20260210_add_whatsapp_settings.sql", 400);
    }
    return jsonError("INTERNAL_ERROR", "No se pudo guardar configuracion WhatsApp", 500);
  }
}
