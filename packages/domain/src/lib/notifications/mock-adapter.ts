import { logger } from '../logger';
import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';

// Logs to the server console instead of calling a real provider. This is
// the 'mock' provider named in .env.example (SMS_PROVIDER/EMAIL_PROVIDER/
// WHATSAPP_PROVIDER) — the honest thing it promises is "printed to the
// server log", and that's exactly what it does; it never marks a
// notification SENT without actually doing that. src/lib/notifications/index.ts
// refuses to select it in production (same rule as OTP_DEV_CODE).
export function createMockAdapter(channel: string): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      const to = recipient.mobile ?? recipient.email ?? recipient.userId;
      logger.info('notifications', `mock ${channel} to=${to} template=${templateKey}`, { payload });
      return { ok: true, providerRef: `mock:${channel}:${Date.now()}` };
    },
  };
}
