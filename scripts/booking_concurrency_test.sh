#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SLUG="${SLUG:-barberia-demo}"
SERVICE_ID="${SERVICE_ID:-33333333-3333-3333-3333-333333333333}"
START_AT="${START_AT:-}"
REQUESTS="${REQUESTS:-20}"
PARALLEL="${PARALLEL:-20}"
CUSTOMER_NAME="${CUSTOMER_NAME:-Load Test}"
CUSTOMER_PHONE="${CUSTOMER_PHONE:-+5491111111111}"
CUSTOMER_EMAIL_PREFIX="${CUSTOMER_EMAIL_PREFIX:-loadtest}"

if [[ -z "$START_AT" ]]; then
  echo "ERROR: Debes definir START_AT en formato ISO UTC."
  echo "Ejemplo: START_AT=2026-02-12T15:00:00Z bash scripts/booking_concurrency_test.sh"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl no está instalado."
  exit 1
fi

if ! command -v uuidgen >/dev/null 2>&1; then
  echo "ERROR: uuidgen no está instalado."
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

endpoint="$BASE_URL/api/v1/public/b/$SLUG/appointments"

send_one() {
  local i="$1"
  local key
  key="$(uuidgen)"

  local payload
  payload=$(cat <<JSON
{"service_id":"$SERVICE_ID","start_at":"$START_AT","customer_name":"$CUSTOMER_NAME $i","customer_phone":"$CUSTOMER_PHONE","customer_email":"${CUSTOMER_EMAIL_PREFIX}${i}@test.local"}
JSON
)

  local body_file="$tmp_dir/$i.body"
  local code_file="$tmp_dir/$i.code"

  local status
  status="$(curl -sS -o "$body_file" -w "%{http_code}" -X POST "$endpoint" \
    -H "content-type: application/json" \
    -H "Idempotency-Key: $key" \
    -d "$payload")"

  echo "$status" > "$code_file"
}

running_jobs=0
for i in $(seq 1 "$REQUESTS"); do
  send_one "$i" &
  running_jobs=$((running_jobs + 1))

  if (( running_jobs >= PARALLEL )); then
    # macOS bash 3.x does not support `wait -n`; wait full batch instead.
    wait
    running_jobs=0
  fi
done
wait

count_status() {
  local target="$1"
  local n
  n="$(grep -h "^$target$" "$tmp_dir"/*.code 2>/dev/null || true)"
  n="$(printf "%s\n" "$n" | sed /^$/d | wc -l | tr -d ' ')"
  echo "$n"
}

ok_201="$(count_status 201)"
ok_200="$(count_status 200)"
conflict_409="$(count_status 409)"
rate_429="$(count_status 429)"
other="$(awk '{print $1}' "$tmp_dir"/*.code | grep -Ev '^(200|201|409|429)$' || true)"
other="$(printf "%s\n" "$other" | sed /^$/d | wc -l | tr -d ' ')"

echo ""
echo "=== Resultado Concurrencia ==="
echo "endpoint: $endpoint"
echo "slot: $START_AT"
echo "requests: $REQUESTS"
echo "parallel: $PARALLEL"
echo "201 created: $ok_201"
echo "200 ok: $ok_200"
echo "409 conflict (esperado en overbooking): $conflict_409"
echo "429 rate_limited: $rate_429"
echo "otros: $other"

success_total=$((ok_201 + ok_200))
if (( success_total == 1 )); then
  echo "PASS: Solo 1 request ganó el slot."
else
  echo "WARN: Se esperaban 1 éxito total; hubo $success_total."
fi

echo ""
echo "Muestra de respuestas no-2xx (hasta 5):"
shown=0
for f in "$tmp_dir"/*.code; do
  c="$(cat "$f")"
  if [[ "$c" != "200" && "$c" != "201" ]]; then
    idx="$(basename "$f" .code)"
    echo "- req #$idx status=$c body=$(tr -d '\n' < "$tmp_dir/$idx.body" | cut -c1-220)"
    shown=$((shown + 1))
    if (( shown >= 5 )); then
      break
    fi
  fi
done
