import { jsonOk } from "@/lib/http";

export async function POST() {
  return jsonOk({ ok: true });
}
