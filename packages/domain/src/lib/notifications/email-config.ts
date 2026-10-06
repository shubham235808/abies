// Email (SMTP) configuration for EMAIL_PROVIDER=mailer91 (and the generic
// smtp provider). Values come from the environment; nothing secret is
// written in code. Functions take an explicit source object so tests can
// pass their own values, and nothing here ever returns a secret value.

export type EmailEnvSource = Readonly<Record<string, string | undefined>>;

// Non-secret provider preset. Only the host default lives here; every value
// can be overridden through EMAIL_SMTP_HOST / EMAIL_SMTP_PORT.
export const MAILER91_DEFAULT_HOST = 'smtp.mailer91.com';

export const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
} as const;

export const SENDER_STATES = ['PENDING', 'VERIFIED', 'DISABLED'] as const;
export type SenderState = (typeof SENDER_STATES)[number];

export type EmailConfigValidation = { ok: true } | { ok: false; missing: string[] };

function value(source: EmailEnvSource, key: string): string | undefined {
  const raw = source[key]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

// SMTP username: SMTP_USERNAME, with EMAIL_SMTP_USER accepted for the
// generic smtp provider only, so existing smtp settings keep working.
function usernameOf(source: EmailEnvSource): string | undefined {
  return value(source, 'SMTP_USERNAME') ?? value(source, 'EMAIL_SMTP_USER');
}

// Returns ok, or the names of the missing keys. Key names only, never values.
export function validateEmailConfig(source: EmailEnvSource = process.env): EmailConfigValidation {
  const provider = value(source, 'EMAIL_PROVIDER');
  if (provider !== 'mailer91' && provider !== 'smtp') {
    return { ok: false, missing: ['EMAIL_PROVIDER'] };
  }
  const missing: string[] = [];
  if (provider === 'smtp' && !value(source, 'EMAIL_SMTP_HOST')) missing.push('EMAIL_SMTP_HOST');
  if (!usernameOf(source)) missing.push('SMTP_USERNAME');
  if (!value(source, 'EMAIL_SMTP_PASSWORD')) missing.push('EMAIL_SMTP_PASSWORD');
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

// Only call after validateEmailConfig() returned ok. The password is returned
// to the caller for the transport only; it must not be logged or stored.
export function readSmtpConnectionConfig(source: EmailEnvSource = process.env): SmtpConnectionConfig {
  const check = validateEmailConfig(source);
  if (!check.ok) {
    throw new Error(`Email configuration incomplete: ${check.missing.join(', ')}`);
  }
  const port = Number(value(source, 'EMAIL_SMTP_PORT') ?? '587');
  return {
    host: value(source, 'EMAIL_SMTP_HOST') ?? MAILER91_DEFAULT_HOST,
    port: Number.isInteger(port) && port > 0 ? port : 587,
    username: usernameOf(source)!,
    password: value(source, 'EMAIL_SMTP_PASSWORD')!,
  };
}

// EMAIL_SENDER_STATES is a JSON object such as {"verification":"VERIFIED"}.
// Fail closed: a missing role is PENDING, and an unreadable value marks every
// role DISABLED, so a broken setting can never let a sender through.
export function senderStatesOf(source: EmailEnvSource = process.env): {
  states: Partial<Record<string, SenderState>>;
  valid: boolean;
} {
  const raw = value(source, 'EMAIL_SENDER_STATES');
  if (raw === undefined) return { states: {}, valid: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { states: {}, valid: false };
    }
    const states: Partial<Record<string, SenderState>> = {};
    for (const [role, state] of Object.entries(parsed)) {
      if (typeof state !== 'string' || !(SENDER_STATES as readonly string[]).includes(state)) {
        return { states: {}, valid: false };
      }
      states[role] = state as SenderState;
    }
    return { states, valid: true };
  } catch {
    return { states: {}, valid: false };
  }
}

export function senderStateFor(role: string, source: EmailEnvSource = process.env): SenderState {
  const { states, valid } = senderStatesOf(source);
  if (!valid) return 'DISABLED';
  return states[role] ?? 'PENDING';
}

// One address, nothing else. Rejects CR and LF (header injection), commas and
// lists, display names, angle brackets, and anything that does not match a
// plain local@domain form. Returns the trimmed address, or undefined.
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function parseSingleAddress(input: string): string | undefined {
  if (typeof input !== 'string') return undefined;
  if (/[\r\n]/.test(input) || input.includes(',')) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return undefined;
  return ADDRESS.test(trimmed) ? trimmed : undefined;
}
