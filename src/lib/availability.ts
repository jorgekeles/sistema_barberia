import { pool } from "@/lib/db";

export async function computePublicSlots(params: {
  slug: string;
  from: string;
  to: string;
  serviceId: string;
  staffUserId?: string;
  limit?: number;
}) {
  const result = await pool.query(
    `
      SELECT *
      FROM compute_public_slots(
        p_slug := $1,
        p_from_date := $2::date,
        p_to_date := $3::date,
        p_service_id := $4::uuid,
        p_staff_user_id := $5::uuid,
        p_limit := $6::int
      )
    `,
    [params.slug, params.from, params.to, params.serviceId, params.staffUserId ?? null, params.limit ?? 100],
  );

  return result.rows;
}
