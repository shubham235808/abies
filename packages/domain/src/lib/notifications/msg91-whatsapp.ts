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
// VERIFY BEFORE ACTIVATION: the endpoint path and the body shape below
// (integrated_number, content_type, payload.template.to_and_components) must be
// checked against MSG91's current WhatsApp documentation, and the template
// language code must match the approved template exactly (for example "en"
// versus "en_US"). This is a credential-dependent step. Do not set
// WHATSAPP_PROVIDER=msg91 in any environment until a real send has been
// checked against a sandbox number.
//
// WHATSAPP_MSG91_TEMPLATE_MAP values are approved WhatsApp template names,
// keyed by ABIES template key and language.
//
// Error text never includes the mobile number, the message body, the auth
// key, or any provider response text.

const ENDPOINT = 'https://control.msg91.com/api/v5/whatsapp/';
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
      const components = Object.fromEntries(
        scalarVariables(payload).map(([, value], index) => [`body_${index + 1}`, { type: 'text', value }]),
      );
      const body = {
        integrated_number: cfg.integratedNumber,
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: templateName,
            language: { code: language, policy: 'deterministic' },
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
