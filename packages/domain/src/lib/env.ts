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
  // IP-scoped Redis rate limits (src/proxy.ts) — defense-in-depth on top of
  // OTP_COOLDOWN_SECONDS's per-mobile check (docs/SECURITY-MODEL.md's
  // "Rate limiting... implemented via Redis counters" promise, not actually
  // wired up until Phase 12).
  RATE_LIMIT_OTP_REQUEST_MAX: z.coerce.number().default(20),
  RATE_LIMIT_OTP_REQUEST_WINDOW_SECONDS: z.coerce.number().default(300),
  RATE_LIMIT_TICKET_CREATE_MAX: z.coerce.number().default(30),
  RATE_LIMIT_TICKET_CREATE_WINDOW_SECONDS: z.coerce.number().default(600),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WEBHOOK_WINDOW_SECONDS: z.coerce.number().default(60),
  SESSION_TTL_DAYS: z.coerce.number().default(7),
  ADMIN_MFA_REQUIRED: z.coerce.boolean().default(true),
  OTP_DEV_CODE: z.string().optional(),
  EXPOSE_DEV_OTP: z.coerce.boolean().default(false),
  DEV_ADMIN_MFA_CODE: z.string().optional(),
  // Off by default everywhere, including docker-compose.prod.yml — this is
  // NOT "disable prod security", it's a second, explicit opt-in that must
  // be set on TOP OF NODE_ENV=production before the OTP_DEV_CODE/
  // EXPOSE_DEV_OTP/DEV_ADMIN_MFA_CODE bypasses fire (see src/modules/auth/auth.service.ts).
  // Exists because a "production" Next.js build (NODE_ENV=production, which
  // Next itself requires) is also used for this repo's LAN-exposed review
  // deployment (docker-compose.yml), which is not the real ESXi Phase 12
  // target and has no real SMS/MFA provider to receive a code with. The
  // real deployment's .env must never set this to true.
  ALLOW_DEV_AUTH_BYPASS_IN_PROD: z.coerce.boolean().default(false),
  ALLOW_DOCTOR_SELF_ONBOARDING: z.coerce.boolean().default(false),
  ALLOW_LAB_SELF_ONBOARDING: z.coerce.boolean().default(false),
  ALLOW_PHARMACY_SELF_ONBOARDING: z.coerce.boolean().default(false),
  ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING: z.coerce.boolean().default(false),
  APP_BASE_URL: z.string().url(),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),

  // Payments (Razorpay). Left blank in dev/test until real (even test-mode)
  // keys are supplied — src/lib/payments/razorpay.ts treats that as "not
  // configured" and the booking flow surfaces that honestly rather than
  // faking a payment.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Notification adapters, one provider name per channel. ABIES has no SMS
  // channel: customers are reached on WhatsApp and Email only. 'mock' is
  // hard-disabled in production (no channel silently pretends to deliver
  // without a real provider wired up) — same rule as OTP_DEV_CODE above.
  // 'smtp' (EMAIL_PROVIDER only, docs/platform/SECURITY-GAP-ANALYSIS.md §1)
  // is a real adapter and is allowed to run anywhere, including locked-down
  // deployments.
  EMAIL_PROVIDER: z.string().default('mock'),
  EMAIL_API_KEY: z.string().optional(),
  WHATSAPP_PROVIDER: z.string().default('mock'),
  WHATSAPP_API_KEY: z.string().optional(),

  // SMTP connection for EMAIL_PROVIDER=smtp. All optional in the schema
  // (only actually needed at that point) — same convention as Razorpay's
  // keys above: blank means "not configured," surfaced honestly by the
  // adapter's own send() failing, not validated eagerly here.
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(587),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  // MSG91 transactional email (EMAIL_PROVIDER=msg91). The auth key is a secret;
  // the template and variable names come from the MSG91 dashboard.
  EMAIL_MSG91_AUTH_KEY: z.string().optional(),
  EMAIL_MSG91_DOMAIN: z.string().optional(),
  EMAIL_MSG91_TEMPLATE_ID: z.string().optional(),
  EMAIL_MSG91_OTP_VARIABLE: z.string().optional(),
  EMAIL_MSG91_EXPIRY_VARIABLE: z.string().optional(),

  // Which channel requestOtp() (modules/auth/auth.service.ts) dispatches the
  // code through, once a user+matching contact method exists. ABIES does not
  // use SMS, so email is the only value and the default.
  OTP_DELIVERY_CHANNEL: z.enum(['email']).default('email'),
});

export type Env = z.infer<typeof envSchema>;

// True for a genuinely locked-down deployment where the OTP_DEV_CODE/
// EXPOSE_DEV_OTP/DEV_ADMIN_MFA_CODE dev-auth bypasses must never fire.
// False in dev/test, and false in a NODE_ENV=production build unless that
// deployment has also explicitly opted in via ALLOW_DEV_AUTH_BYPASS_IN_PROD
// (docker-compose.yml's review container does; the real prod target must not).
export function isLockedDownDeployment(env: Env): boolean {
  return env.NODE_ENV === 'production' && !env.ALLOW_DEV_AUTH_BYPASS_IN_PROD;
}

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
