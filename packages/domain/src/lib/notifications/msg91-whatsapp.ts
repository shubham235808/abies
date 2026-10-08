import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';
import { missingMessage, normaliseIndianMobile, payloadLanguage, readWhatsappConfig, resolveTemplateId } from './provider-config';

// MSG91 WhatsApp template send.
//
// Endpoint and body shape confirmed against a real, working example supplied
// by the user (2026-10-08) — api.msg91.com's bulk outbound endpoint, not
// control.msg91.com (the earlier guess here was wrong; this is the likely
// reason WhatsApp delivery was never actually working).
//
// body_1/button_1 CONFIRMED against MSG91's own delivery logs (2026-10-08,
// user shared the CSV export directly): abies_auth_otp takes exactly ONE
// body parameter. An earlier version of this adapter also sent
// expiresInSeconds as body_2 (generically dumping every scalar payload
// field), which MSG91 rejected outright: "body: number of
// localizable_params (2) does not match the expected number of params
// (1)". button_1 being the same OTP code as body_1 is confirmed correct —
// the one log row using only {body_1, button_1} shows delivery_report:
// delivered. So this intentionally does NOT use every scalar field in the
// payload (unlike the email adapters' approach) — it uses only `otp`,
// matching this specific, currently-only approved template. A future
// second WhatsApp template with a genuinely different param count would
// need its own handling here, not a generic one; don't "fix" this back to
// scalarVariables(payload) without checking the new template's real param
// count first.
//
// WHATSAPP_MSG91_TEMPLATE_MAP values are approved WhatsApp template names,
// keyed by ABIES template key and language. WHATSAPP_MSG91_NAMESPACE is one
// value for the whole WhatsApp Business Account, not per-template.
//
// Error text never includes the mobile number, the message body, the auth
// key, or any provider response text.

const ENDPOINT = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const TIMEOUT_MS = 10_000;

export function createMsg91WhatsappAdapter(): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      const loaded = readWhatsappConfig();
      if (!loaded.ok) {
        return { ok: false, error: missingMessage('WHATSAPP', loaded.missing), retryable: false };
      }
      const cfg = loaded.config;

      const mobile = normaliseIndianMobile(recipient.mobile);
      if (!mobile) {
        return { ok: false, error: 'Recipient mobile is not a valid Indian number', retryable: false };
      }

      const language = payloadLanguage(payload);
      const templateName = resolveTemplateId(cfg.templateMap, templateKey, language);
      if (!templateName) {
        return { ok: false, error: `No MSG91 WhatsApp template mapped for ${templateKey} (${language})`, retryable: false };
      }

      // abies_auth_otp takes exactly one body parameter (see this file's
      // header) — the OTP code, not every scalar field the caller happened
      // to pass (expiresInSeconds is for the email channel's template, not
      // this one).
      const otp = payload.otp;
      if (typeof otp !== 'string' && typeof otp !== 'number') {
        return { ok: false, error: 'WhatsApp OTP payload is missing otp', retryable: false };
      }
      const otpText = String(otp);
      const components: Record<string, { type: string; value?: string; subtype?: string }> = {
        body_1: { type: 'text', value: otpText },
        button_1: { subtype: 'url', type: 'text', value: otpText },
      };
      const body = {
        integrated_number: cfg.integratedNumber,
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: templateName,
            language: { code: language, policy: 'deterministic' },
            namespace: cfg.namespace,
            to_and_components: [{ to: [mobile], components }],
          },
        },
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', accept: 'application/json', authkey: cfg.authKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          return { ok: false, error: `MSG91 WhatsApp rejected the request (HTTP ${res.status})`, retryable };
        }

        const json = (await res.json().catch(() => ({}))) as { type?: unknown; message?: unknown; request_id?: unknown };
        if (json.type === 'error') {
          return { ok: false, error: 'MSG91 WhatsApp rejected the request (provider error)', retryable: false };
        }
        const requestId =
          typeof json.request_id === 'string'
            ? json.request_id
            : json.type === 'success' && typeof json.message === 'string'
              ? json.message
              : 'msg91-whatsapp';
        return { ok: true, providerRef: requestId };
      } catch (err) {
        const timedOut = err instanceof Error && err.name === 'AbortError';
        return {
          ok: false,
          error: timedOut ? 'MSG91 WhatsApp request timed out' : 'MSG91 WhatsApp request failed (network error)',
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
