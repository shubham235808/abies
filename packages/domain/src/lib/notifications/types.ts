import type { NotificationChannel } from '@prisma/client';

export interface NotificationRecipient {
  userId: string;
  mobile?: string | null;
  email?: string | null;
}

export type SendResult = { ok: true; providerRef: string } | { ok: false; error: string };

export interface NotificationAdapter {
  send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult>;
}

export type ExternalChannel = Extract<NotificationChannel, 'SMS' | 'EMAIL' | 'WHATSAPP'>;
