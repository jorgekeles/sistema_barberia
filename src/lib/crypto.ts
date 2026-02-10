import crypto from "node:crypto";

export function hmacSha256Hex(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length) return false;

  const bufA = Buffer.from(cleanA, "utf8");
  const bufB = Buffer.from(cleanB, "utf8");
  return crypto.timingSafeEqual(bufA, bufB);
}

export function tryJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
