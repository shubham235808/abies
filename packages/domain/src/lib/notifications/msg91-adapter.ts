import { getEnv } from '../env';
import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';

// MSG91 transactional email (https://control.msg91.com/api/v5/email/send).
// The recipient's email is the one the user signed in with. The name is the
// account's name, falling back to the email when none was given. Template variable names are configured, not
// hard-coded, because they're whatever the template in the MSG91 dashboard uses.

const ENDPOINT = 'https://control.msg91.com/api/v5/email/send';

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

export function createMsg91Adapter(): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      if (!recipient.email) return { ok: false, error: 'Recipient has no email on file' };
      if (templateKey !== 'auth.otp_code') return { ok: false, error: `No MSG91 template mapped for ${templateKey}` };

      let cfg: ReturnType<typeof requireConfig>;
      try {
        cfg = requireConfig();
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'MSG91 config error' };
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

      // Hard timeout: a stalled provider must not hang the sign-in request.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authkey: cfg.authKey },
          body: JSON.stringify({
            recipients: [
              {
                to: [{ email: recipient.email, name: recipient.name?.trim() || recipient.email }],
                variables,
              },
            ],
            from: { email: `no-reply@${cfg.domain}` },
            domain: cfg.domain,
            template_id: cfg.templateId,
          }),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: unknown };
        if (!res.ok || body.status === 'error') {
          return { ok: false, error: body.message ?? `MSG91 responded ${res.status}` };
        }
        return { ok: true, providerRef: String((body as { request_id?: string }).request_id ?? 'msg91') };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'MSG91 send failed' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
