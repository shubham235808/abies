import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';
import {
  missingMessage,
  normaliseIndianMobile,
  payloadLanguage,
  readWhatsappConfig,
  resolveTemplateId,
  scalarVariables,
} from './provider-config';

// MSG91 WhatsApp template send.
//
// Endpoint and body shape confirmed against a real, working example supplied
// by the user (2026-10-08) — api.msg91.com's bulk outbound endpoint, not
// control.msg91.com (the earlier guess here was wrong; this is the likely
// reason WhatsApp delivery was never actually working). The template
// language code must still match the approved template exactly (for example
// "en" versus "en_US").
//
// button_1 ASSUMPTION, NOT YET CONFIRMED: abies_auth_otp has a button
// component (user-confirmed 2026-10-08), but exactly what dynamic value that
// button needs wasn't specified — the example supplied was generic MSG91
// documentation with placeholder values. This adapter assumes the button's
// url-subtype dynamic variable is the same OTP code as body_1 (the common
// "tap to verify" pattern, where the template's own configured base URL has
// the code appended). VERIFY against a real sandbox send before trusting
// this for real users — if the button needs something else (a full
// pre-built URL, a different value), this needs to change.
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

      // Body variables become body_1, body_2, ... in payload order.
      const variables = scalarVariables(payload);
      const components: Record<string, { type: string; value?: string; subtype?: string }> = Object.fromEntries(
        variables.map(([, value], index) => [`body_${index + 1}`, { type: 'text', value }]),
      );
      // See this file's header: abies_auth_otp has a url-subtype button whose
      // dynamic value is assumed to be the same first variable (the OTP code)
      // — not yet confirmed against a real sandbox send.
      const firstVariable = variables[0];
      if (firstVariable) {
        components.button_1 = { subtype: 'url', type: 'text', value: firstVariable[1] };
      }
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
