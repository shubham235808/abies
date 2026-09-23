import { z } from 'zod';

// Fails fast at startup if a required var is missing, instead of surfacing
// as an obscure runtime error the first time a route touches it.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  STORAGE_ENDPOINT: z.string().min(1),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER must be at least 32 characters'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_COOLDOWN_SECONDS: z.coerce.number().default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  SESSION_TTL_DAYS: z.coerce.number().default(7),
  ADMIN_MFA_REQUIRED: z.coerce.boolean().default(true),
  OTP_DEV_CODE: z.string().optional(),
  EXPOSE_DEV_OTP: z.coerce.boolean().default(false),
  DEV_ADMIN_MFA_CODE: z.string().optional(),
  ALLOW_DOCTOR_SELF_ONBOARDING: z.coerce.boolean().default(true),
  APP_BASE_URL: z.string().url(),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  cached = parsed.data;
  return cached;
}
