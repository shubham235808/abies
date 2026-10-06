import nodemailer from 'nodemailer';
import { senderFor, replyToFor } from '../../modules/notifications/senders';
import { BRAND_NAME, EmailTemplateError, renderEmailTemplate, type EmailVariables } from '../../modules/notifications/email-templates';
import {
  SMTP_TIMEOUTS,
  parseSingleAddress,
  readSmtpConnectionConfig,
  senderStateFor,
  senderStatesOf,
  validateEmailConfig,
  type EmailEnvSource,
  type SmtpConnectionConfig,
} from './email-config';
import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';

// SMTP adapter (nodemailer), used for EMAIL_PROVIDER=mailer91 and the generic
// EMAIL_PROVIDER=smtp. Settings come from config (email-config.ts). The
// password is passed only to the transport and never appears in a log, an
// error message or a return value.
//
// Errors are reported with a code and an SMTP response code only. The raw
// nodemailer message is never copied, because it can carry server text or
// message content.

export const BLOCKED_EXTERNAL_CONFIGURATION = 'BLOCKED_EXTERNAL_CONFIGURATION';

function permanent(error: string): SendResult {
  return { ok: false, error, retryable: false };
}

// Transport options. Fixed security posture: implicit TLS off, STARTTLS
// required, certificate validation on. Pooling off, so no connection is kept
// between sends.
export function buildTransportOptions(cfg: SmtpConnectionConfig) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: false,
    requireTLS: true,
    auth: { user: cfg.username, pass: cfg.password },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
    pool: false,
    connectionTimeout: SMTP_TIMEOUTS.connectionTimeout,
    greetingTimeout: SMTP_TIMEOUTS.greetingTimeout,
    socketTimeout: SMTP_TIMEOUTS.socketTimeout,
  };
}

// Node/nodemailer error codes for TLS and STARTTLS failures. These are
// permanent: retrying with the same settings will fail the same way.
const PERMANENT_CODES = new Set(['EAUTH', 'ETLS', 'EREQUIRETLS', 'EENVELOPE', 'EMESSAGE']);
const NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ESOCKET',
  'ENOTFOUND',
  'EDNS',
  'EAI_AGAIN',
  'EPIPE',
]);

export interface SmtpErrorClass {
  retryable: boolean;
  // Safe summary: nodemailer code and SMTP response code only.
  detail: string;
}

export function classifySmtpError(err: unknown): SmtpErrorClass {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown };
  const code = typeof e.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(e.code) ? e.code : undefined;
  const responseCode = typeof e.responseCode === 'number' && Number.isInteger(e.responseCode) ? e.responseCode : undefined;
  const detail = [code ?? 'UNKNOWN', responseCode !== undefined ? String(responseCode) : undefined].filter(Boolean).join(' ');

  // The SMTP reply code decides first when the server gave one.
  if (responseCode !== undefined) {
    if (responseCode === 535) return { retryable: false, detail }; // authentication failed
    if (responseCode >= 400 && responseCode < 500) return { retryable: true, detail };
    if (responseCode >= 500 && responseCode < 600) return { retryable: false, detail };
  }
  if (code !== undefined) {
    if (code === 'EAUTH' || PERMANENT_CODES.has(code)) return { retryable: false, detail };
    if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code.includes('SELF_SIGNED') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return { retryable: false, detail };
    }
    if (NETWORK_CODES.has(code)) return { retryable: true, detail };
  }
  // Unknown failures are treated as temporary, the same default as the rest of
  // the notification pipeline.
  return { retryable: true, detail };
}

// Variables for a template: the payload's string and number values, the
// recipient's name (or "there"), and expiryMinutes derived from
// expiresInSeconds for the OTP template.
export function buildEmailVariables(
  templateKey: string,
  recipient: NotificationRecipient,
  payload: Record<string, unknown>,
): EmailVariables {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
  }
  if (vars.name === undefined) {
    vars.name = recipient.name?.trim() || 'there';
  }
  if (templateKey === 'auth.otp_code' && vars.expiryMinutes === undefined && typeof payload.expiresInSeconds === 'number') {
    vars.expiryMinutes = Math.max(1, Math.round(payload.expiresInSeconds / 60));
  }
  return vars;
}

export function createSmtpAdapter(source: EmailEnvSource = process.env): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      // 1. Configuration. A missing key blocks the send; nothing is attempted.
      const check = validateEmailConfig(source);
      if (!check.ok) {
        return permanent(`${BLOCKED_EXTERNAL_CONFIGURATION}: missing ${check.missing.join(', ')}`);
      }

      // 2. Recipient: exactly one plain address.
      const to = recipient.email ? parseSingleAddress(recipient.email) : undefined;
      if (!to) return permanent('Recipient has no valid email address');

      // 3. Sender identity. It must be VERIFIED; anything else is refused.
      let from: string;
      let role: string;
      try {
        const identity = senderFor(templateKey, source as NodeJS.ProcessEnv);
        role = identity.role;
        const address = parseSingleAddress(identity.address);
        if (!address) return permanent('Sender address is not valid');
        from = address;
      } catch {
        return permanent('Sender configuration is invalid');
      }
      if (!senderStatesOf(source).valid) {
        return permanent('EMAIL_SENDER_STATES is not valid JSON or has an unknown state; send refused');
      }
      const state = senderStateFor(role, source);
      if (state !== 'VERIFIED') {
        return permanent(`Sender "${role}" is ${state}, not VERIFIED; send refused`);
      }

      // 4. Reply-To, from the family mapping in senders.ts.
      const replyTo = parseSingleAddress(replyToFor(templateKey));
      if (!replyTo) return permanent('Reply-To address is not valid');

      // 5. Render. A missing or empty variable is permanent and names only the
      // variable, never its value.
      let rendered: ReturnType<typeof renderEmailTemplate>;
      try {
        rendered = renderEmailTemplate(templateKey, buildEmailVariables(templateKey, recipient, payload));
      } catch (err) {
        if (err instanceof EmailTemplateError) return permanent(err.message);
        return permanent('Email template could not be rendered');
      }

      // 6. Send.
      let cfg: SmtpConnectionConfig;
      try {
        cfg = readSmtpConnectionConfig(source);
      } catch {
        return permanent(`${BLOCKED_EXTERNAL_CONFIGURATION}: email configuration is incomplete`);
      }
      try {
        const transport = nodemailer.createTransport(buildTransportOptions(cfg));
        const info = await transport.sendMail({
          from: `${BRAND_NAME} <${from}>`,
          to,
          replyTo,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        return { ok: true, providerRef: String(info.messageId || 'smtp-accepted') };
      } catch (err) {
        const { retryable, detail } = classifySmtpError(err);
        return { ok: false, error: `SMTP send failed (${detail})`, retryable };
      }
    },
  };
}
