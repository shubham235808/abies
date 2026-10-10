import { getEnv } from '../env';
import { replyToFor } from '../../modules/notifications/senders';
import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';

// MSG91 transactional email (https://control.msg91.com/api/v5/email/send).
// The recipient's email is the one the user signed in with. The name is the
// account's name, falling back to the email when none was given. Template variable names are configured, not
// hard-coded, because they're whatever the template in the MSG91 dashboard uses.
//
// Each MSG91 email template is its own fixed shape — auth.otp_code's
// template uses named placeholders ({{otp}}, configured via
// EMAIL_MSG91_OTP_VARIABLE); contact.enquiry.internal's template
// (abies_enquiry_form) uses MSG91's numbered {{VAR1}}..{{VAR9}}
// placeholders instead, confirmed against the template the user built in
// the MSG91 dashboard (2026-10-10). A numbered-placeholder template has no
// per-variable names to configure, so its field order is hardcoded below —
// same precedent as msg91-whatsapp.ts's body_1/button_1 for its one
// approved template: don't genericize this into "every scalar field in
// payload order" without confirming the new template's real VAR count and
// order first.

const ENDPOINT = 'https://control.msg91.com/api/v5/email/send';

// The From address is the sender chosen for this template. Falls back to the
// no-reply address on the configured domain when no sender was resolved.
function fromAddressFor(payload: Record<string, unknown>, domain: string): string {
  const sender = payload.sender as { address?: string } | undefined;
  return sender?.address ?? `no-reply@${domain}`;
}

function requireConfig(): {
  authKey: string;
  domain: string;
  templateId: string;
  otpVariable: string;
  expiryVariable: string | undefined;
} {
  const env = getEnv();
  const missing = [
    ['EMAIL_MSG91_AUTH_KEY', env.EMAIL_MSG91_AUTH_KEY],
    ['EMAIL_MSG91_DOMAIN', env.EMAIL_MSG91_DOMAIN],
    ['EMAIL_MSG91_TEMPLATE_ID', env.EMAIL_MSG91_TEMPLATE_ID],
    ['EMAIL_MSG91_OTP_VARIABLE', env.EMAIL_MSG91_OTP_VARIABLE],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`MSG91 email is not configured: ${missing.join(', ')}`);
  return {
    authKey: env.EMAIL_MSG91_AUTH_KEY!,
    domain: env.EMAIL_MSG91_DOMAIN!,
    templateId: env.EMAIL_MSG91_TEMPLATE_ID!,
    otpVariable: env.EMAIL_MSG91_OTP_VARIABLE!,
    expiryVariable: env.EMAIL_MSG91_EXPIRY_VARIABLE || undefined,
  };
}

// contact.enquiry.internal's own config: just the auth key, domain and this
// template's id — no per-variable names, since the template's placeholders
// are MSG91's numbered {{VARn}}, not named ones.
function requireContactConfig(): { authKey: string; domain: string; templateId: string } {
  const env = getEnv();
  const missing = [
    ['EMAIL_MSG91_AUTH_KEY', env.EMAIL_MSG91_AUTH_KEY],
    ['EMAIL_MSG91_DOMAIN', env.EMAIL_MSG91_DOMAIN],
    ['EMAIL_MSG91_CONTACT_TEMPLATE_ID', env.EMAIL_MSG91_CONTACT_TEMPLATE_ID],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`MSG91 email is not configured: ${missing.join(', ')}`);
  return {
    authKey: env.EMAIL_MSG91_AUTH_KEY!,
    domain: env.EMAIL_MSG91_DOMAIN!,
    templateId: env.EMAIL_MSG91_CONTACT_TEMPLATE_ID!,
  };
}

// abies_enquiry_form's fixed VAR1..VAR9 order — matches the field order in
// the HTML the template was built from, and the required-variable list in
// modules/notifications/templates.ts's CONTACT_ENQUIRY_INTERNAL definition.
const CONTACT_ENQUIRY_VAR_ORDER = [
  'referenceId',
  'name',
  'email',
  'mobile',
  'queryType',
  'preferredContact',
  'submittedAt',
  'subject',
  'message',
] as const;

function contactEnquiryVariables(payload: Record<string, unknown>): Record<string, string> {
  const variables: Record<string, string> = {};
  CONTACT_ENQUIRY_VAR_ORDER.forEach((field, index) => {
    variables[`VAR${index + 1}`] = String(payload[field] ?? '');
  });
  return variables;
}

// Shared by every template this adapter sends: one POST, one response-shape
// check, one error/timeout mapping. Each templateKey branch above only
// builds (templateId, domain, variables) differently before calling this.
async function sendViaMsg91(args: {
  authKey: string;
  domain: string;
  templateId: string;
  toEmail: string;
  toName: string;
  variables: Record<string, string>;
  replyTo: string;
  fromEmail: string;
}): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json', authkey: args.authKey },
      body: JSON.stringify({
        recipients: [{ to: [{ email: args.toEmail, name: args.toName }], variables: args.variables }],
        from: { name: 'ABIES', email: args.fromEmail },
        reply_to: [{ email: args.replyTo }],
        domain: args.domain,
        template_id: args.templateId,
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: unknown };
    if (!res.ok || body.status === 'error') {
      // 429 and 5xx are provider-side and may succeed later; other 4xx are
      // permanent (bad template, bad destination, bad key).
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: body.message ?? `MSG91 responded ${res.status}`, retryable };
    }
    return { ok: true, providerRef: String((body as { request_id?: string }).request_id ?? 'msg91') };
  } catch (err) {
    // Timeouts and network failures are temporary.
    return { ok: false, error: err instanceof Error ? err.message : 'MSG91 send failed', retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export function createMsg91Adapter(): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      if (!recipient.email) return { ok: false, error: 'Recipient has no email on file', retryable: false };
      const toName = recipient.name?.trim() || recipient.email;

      if (templateKey === 'auth.otp_code') {
        let cfg: ReturnType<typeof requireConfig>;
        try {
          cfg = requireConfig();
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'MSG91 config error', retryable: false };
        }

        // company_name is a fixed variable in the abies_otp template.
        const variables: Record<string, string> = {
          company_name: 'ABIES',
          [cfg.otpVariable]: String(payload.otp ?? ''),
        };
        if (cfg.expiryVariable) {
          const minutes = Math.round(Number(payload.expiresInSeconds ?? 300) / 60);
          variables[cfg.expiryVariable] = String(minutes);
        }

        return sendViaMsg91({
          authKey: cfg.authKey,
          domain: cfg.domain,
          templateId: cfg.templateId,
          toEmail: recipient.email,
          toName,
          variables,
          replyTo: replyToFor(templateKey),
          fromEmail: fromAddressFor(payload, cfg.domain),
        });
      }

      if (templateKey === 'contact.enquiry.internal') {
        let cfg: ReturnType<typeof requireContactConfig>;
        try {
          cfg = requireContactConfig();
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'MSG91 config error', retryable: false };
        }

        return sendViaMsg91({
          authKey: cfg.authKey,
          domain: cfg.domain,
          templateId: cfg.templateId,
          toEmail: recipient.email,
          toName,
          variables: contactEnquiryVariables(payload),
          replyTo: replyToFor(templateKey),
          fromEmail: fromAddressFor(payload, cfg.domain),
        });
      }

      return { ok: false, error: `No MSG91 template mapped for ${templateKey}`, retryable: false };
    },
  };
}
