import { pool } from "@/lib/db";

export type EffectiveAccess = "allow" | "allow_with_warning" | "block";

export async function getTenantSubscriptionStatus(tenantId: string) {
  const result = await pool.query(
    `
      SELECT status, current_period_end, grace_ends_at, cancel_at_period_end
      FROM subscriptions
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [tenantId],
  );

  if (!result.rowCount) {
    const business = await pool.query("SELECT trial_ends_at FROM businesses WHERE tenant_id = $1 LIMIT 1", [tenantId]);
    if (!business.rowCount) return { status: "blocked" as const, effectiveAccess: "block" as EffectiveAccess };

    const now = Date.now();
    const trialEndsAt = new Date(business.rows[0].trial_ends_at).getTime();
    return {
      status: now <= trialEndsAt ? "trialing" : "blocked",
      effectiveAccess: now <= trialEndsAt ? ("allow" as EffectiveAccess) : ("block" as EffectiveAccess),
    };
  }

  const status = result.rows[0].status as string;
  const effectiveAccess: EffectiveAccess =
    status === "active" || status === "trialing" || status === "grace"
      ? "allow"
      : status === "past_due"
        ? "allow_with_warning"
        : "block";

  return { status, effectiveAccess };
}
