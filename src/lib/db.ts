import { Pool, PoolClient } from "pg";
import { env } from "@/lib/env";

declare global {
  var __pgPool: Pool | undefined;
}

function buildPgConnectionString(raw: string) {
  const url = new URL(raw);
  // Prevent pg-connection-string sslmode aliases from enforcing verify-full.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: buildPgConnectionString(env.DATABASE_URL),
    // Serverless-friendly pool sizing to avoid exhausting Supabase pooler clients.
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export async function withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.tenant_id = $1", [tenantId]);
    const res = await fn(client);
    await client.query("COMMIT");
    return res;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
