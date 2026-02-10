import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "SLOT_TAKEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(code: ApiErrorCode, message: string, status: number, requestId?: string) {
  return NextResponse.json({ error: { code, message, request_id: requestId ?? crypto.randomUUID() } }, { status });
}
