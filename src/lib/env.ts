import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url().optional(),
  BILLING_SUCCESS_URL: z.string().url().optional(),
  BILLING_CANCEL_URL: z.string().url().optional(),
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PRICE_ARS_CENTS: z.string().optional(),
  MP_WEBHOOK_URL: z.string().url().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  LEMON_API_KEY: z.string().optional(),
  LEMON_STORE_ID: z.string().optional(),
  LEMON_VARIANT_ID: z.string().optional(),
  LEMON_WEBHOOK_URL: z.string().url().optional(),
  LEMON_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_ENABLED: z.coerce.boolean().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
