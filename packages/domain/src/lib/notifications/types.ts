import type { NotificationChannel } from '@prisma/client';

export interface NotificationRecipient {
  userId: string;
  mobile?: string | null;
  email?: string | null;
  name?: string | null;
}

// retryable: true for timeouts, network errors, 5xx and rate limits; false for
// bad destinations, bad templates and bad credentials. Unset means retryable.
export type SendResult = { ok: true; providerRef: string } | { ok: false; error: string; retryable?: boolean };

export interface NotificationAdapter {
  send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult>;
}

export type ExternalChannel = Extract<NotificationChannel, 'SMS' | 'EMAIL' | 'WHATSAPP'>;
