import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';
import {
  missingMessage,
  normaliseIndianMobile,
  payloadLanguage,
  readSmsConfig,
  resolveTemplateId,
  scalarVariables,
} from './provider-config';

// MSG91 SMS via the Flow API. Template ids come from SMS_MSG91_TEMPLATE_MAP,
// keyed by ABIES template key and language; nothing here is hard-coded.
//
// Error text never includes the mobile number, the message body, the auth
// key, or any text the provider returned. A provider error body can echo the
// recipient, so only the HTTP status is reported.

const ENDPOINT = 'https://control.msg91.com/api/v5/flow/';
const TIMEOUT_MS = 10_000;

export function createMsg91SmsAdapter(): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      const loaded = readSmsConfig();
      if (!loaded.ok) {
        // Permanent: retrying cannot fix a missing setting. Names keys only.
        return { ok: false, error: missingMessage('SMS', loaded.missing), retryable: false };
      }
      const cfg = loaded.config;

      const mobile = normaliseIndianMobile(recipient.mobile);
      if (!mobile) {
        return { ok: false, error: 'Recipient mobile is not a valid Indian number', retryable: false };
      }

      const language = payloadLanguage(payload);
      const templateId = resolveTemplateId(cfg.templateMap, templateKey, language);
      if (!templateId) {
        return { ok: false, error: `No MSG91 SMS template mapped for ${templateKey} (${language})`, retryable: false };
      }

      const variables = Object.fromEntries(scalarVariables(payload));
      const body = {
        template_id: templateId,
        sender: cfg.senderId,
        short_url: 0,
        // mobiles is spread last so a payload key cannot overwrite the recipient.
        recipients: [{ ...variables, mobiles: mobile }],
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
          // 429 and 5xx are provider-side and may succeed later. Other 4xx
          // (bad template, bad sender, bad key) will not change on retry.
          const retryable = res.status === 429 || res.status >= 500;
          return { ok: false, error: `MSG91 SMS rejected the request (HTTP ${res.status})`, retryable };
        }

        const json = (await res.json().catch(() => ({}))) as { type?: unknown; message?: unknown; request_id?: unknown };
        // MSG91 can answer 200 with type "error" for a rejected template or
        // recipient. That is a permanent rejection, not a transient one.
        if (json.type === 'error') {
          return { ok: false, error: 'MSG91 SMS rejected the request (provider error)', retryable: false };
        }
        // Flow API returns the request id in `message` on success; request_id
        // is accepted too. Verify against MSG91's current response shape.
        const requestId =
          typeof json.request_id === 'string'
            ? json.request_id
            : json.type === 'success' && typeof json.message === 'string'
              ? json.message
              : 'msg91-sms';
        return { ok: true, providerRef: requestId };
      } catch (err) {
        // Timeouts and network failures are temporary. The error object is not
        // echoed because fetch errors can carry request details.
        const timedOut = err instanceof Error && err.name === 'AbortError';
        return {
          ok: false,
          error: timedOut ? 'MSG91 SMS request timed out' : 'MSG91 SMS request failed (network error)',
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
