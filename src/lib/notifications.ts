import { env } from "@/lib/env";

type WhatsAppConfig = {
  enabled: boolean;
  apiToken?: string | null;
  phoneNumberId?: string | null;
};

function normalizePhoneForWhatsApp(raw: string) {
  return raw.replace(/\D/g, "");
}

function resolveConfig(override?: WhatsAppConfig): Required<WhatsAppConfig> {
  const enabled = override?.enabled ?? Boolean(env.WHATSAPP_ENABLED);
  const apiToken = override?.apiToken ?? env.WHATSAPP_API_TOKEN ?? null;
  const phoneNumberId = override?.phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID ?? null;
  return { enabled, apiToken, phoneNumberId };
}

export async function sendWhatsAppBookingConfirmation(
  input: {
    toPhone: string;
    customerName: string;
    businessName: string;
    serviceName: string;
    startAtIso: string;
    timezone: string;
  },
  configOverride?: WhatsAppConfig,
) {
  const config = resolveConfig(configOverride);

  if (!config.enabled || !config.apiToken || !config.phoneNumberId) {
    return { sent: false as const, reason: "whatsapp_not_configured" };
  }

  const to = normalizePhoneForWhatsApp(input.toPhone);
  if (!to) return { sent: false as const, reason: "invalid_phone" };

  const when = new Date(input.startAtIso).toLocaleString("es-AR", {
    timeZone: input.timezone,
    dateStyle: "short",
    timeStyle: "short",
  });

  const text =
    `Hola ${input.customerName}, tu turno esta confirmado.\n` +
    `Negocio: ${input.businessName}\n` +
    `Servicio: ${input.serviceName}\n` +
    `Fecha y hora: ${when} (${input.timezone})\n` +
    `Gracias por reservar.`;

  const response = await fetch(`https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { sent: false as const, reason: `provider_error:${response.status}:${detail}` };
  }

  return { sent: true as const };
}
